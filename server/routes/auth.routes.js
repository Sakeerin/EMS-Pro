import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit, { MemoryStore, ipKeyGenerator } from 'express-rate-limit';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import jwt from 'jsonwebtoken';
import { protect, generateToken } from '../middleware/auth.js';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';

const router = express.Router();

// Token lifetime for sign-ins without "Remember me"
const SESSION_TOKEN_LIFETIME = '12h';

// Rate limit store that uses Redis while it is connected and memory otherwise.
// The store is picked on every request because rateLimit() calls init() at
// import time, before Redis has connected. Each limiter needs its own prefix
// so their counters don't share Redis keys.
const createLimiterStore = (prefix) => ({
    prefix,
    init(options) {
        this.options = options;
        this.memoryStore = new MemoryStore();
        this.memoryStore.init(options);
    },
    getRedisStore() {
        const client = getRedisClient();
        if (!client) return null;
        if (!this.redisStore) {
            this.redisStore = new RedisStore({
                prefix,
                sendCommand: (...args) => client.sendCommand(args),
            });
            this.redisStore.init(this.options);
        }
        return this.redisStore;
    },
    async run(method, key) {
        const redisStore = this.getRedisStore();
        if (redisStore) {
            try {
                return await redisStore[method](key);
            } catch (err) {
                console.warn(`⚠️  Rate limit Redis ${method} failed, using memory store: ${err.message}`);
            }
        }
        return this.memoryStore[method](key);
    },
    increment(key) { return this.run('increment', key); },
    decrement(key) { return this.run('decrement', key); },
    resetKey(key) { return this.run('resetKey', key); }
});

// Login brute-force protection. Only failed attempts count, so people signing
// in successfully from a shared office IP never use up the limit.
// Per account and IP: 5 failed attempts per 15 minutes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').trim().toLowerCase()}`,
    message: {
        success: false,
        message: 'Too many login attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createLimiterStore('rl:login:')
});

// Per IP across all accounts: 50 failed attempts per 15 minutes, against
// password spraying from one address
const loginIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        message: 'Too many failed login attempts from this network, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createLimiterStore('rl:login-ip:')
});

// Validation middleware helper
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
    }
    next();
};

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login',
    loginIpLimiter,
    loginLimiter,
    [
        body('email')
            .isEmail().withMessage('Please enter a valid email')
            .normalizeEmail(),
        body('password')
            .notEmpty().withMessage('Password is required'),
        body('rememberMe')
            .optional()
            .isBoolean({ strict: true }).withMessage('rememberMe must be true or false'),
    ],
    validate,
    async (req, res) => {
        try {
            const { email, password, rememberMe } = req.body;

            // Check user
            const user = await User.findOne({ email }).select('+password').populate('employee');
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Check password
            const isMatch = await user.matchPassword(password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Check if active
            if (!user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'Account is deactivated'
                });
            }

            // Update last login
            user.lastLogin = new Date();
            await user.save({ validateBeforeSave: false });

            // "Remember me": a cookie kept for the token's whole lifetime
            // (JWT_EXPIRE). Otherwise a session cookie, gone when the browser
            // closes, holding a token that also expires within 12 hours in case
            // the browser stays open or restores its session
            const token = generateToken(user._id, rememberMe ? undefined : SESSION_TOKEN_LIFETIME);
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            };
            if (rememberMe) {
                cookieOptions.maxAge = jwt.decode(token).exp * 1000 - Date.now();
            }
            res.cookie('token', token, cookieOptions);

            res.json({
                success: true,
                data: {
                    _id: user._id,
                    email: user.email,
                    role: user.role,
                    employee: user.employee,
                    mustChangePassword: user.mustChangePassword || false
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Login failed. Please try again.'
            });
        }
    }
);

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('employee');
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user profile'
        });
    }
});

// @route   POST /api/auth/logout
// @desc    Logout user / clear cookie
// @access  Private
router.post('/logout', protect, (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
});

// @route   PUT /api/auth/password
// @desc    Update password
// @access  Private
router.put('/password',
    protect,
    [
        body('currentPassword')
            .notEmpty().withMessage('Current password is required'),
        body('newPassword')
            .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .withMessage('Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number'),
        body('newPassword')
            .custom((value, { req }) => value !== req.body.currentPassword)
            .withMessage('New password must be different from the current password'),
    ],
    validate,
    async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;

            const user = await User.findById(req.user._id).select('+password');

            // Check current password
            const isMatch = await user.matchPassword(currentPassword);
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Validate new password strength
            const strengthCheck = User.validatePasswordStrength(newPassword);
            if (!strengthCheck.valid) {
                return res.status(400).json({
                    success: false,
                    message: strengthCheck.message
                });
            }

            user.password = newPassword;
            user.mustChangePassword = false; // Clear the flag after password change
            await user.save();

            res.json({
                success: true,
                message: 'Password updated successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to update password'
            });
        }
    }
);

export default router;
