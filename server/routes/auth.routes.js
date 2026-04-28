import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import { protect, generateToken } from '../middleware/auth.js';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';

const router = express.Router();

// Helper to create store that falls back to memory
const getLimiterStore = () => {
    return {
        // We defer store creation until the first request to ensure Redis had time to connect
        init: function (options) {
            this.options = options;
            this.client = getRedisClient();
            if (this.client) {
                this.redisStore = new RedisStore({
                    sendCommand: (...args) => this.client.sendCommand(args),
                });
            } else {
                // Use default memory store
                const { MemoryStore } = require('express-rate-limit');
                this.memoryStore = new MemoryStore();
            }
        },
        increment: async function (key) {
            if (this.redisStore) return this.redisStore.increment(key);
            if (this.memoryStore) return this.memoryStore.increment(key);
            return { totalHits: 1, resetTime: new Date() }; // Fallback fallback
        },
        decrement: async function (key) {
            if (this.redisStore) return this.redisStore.decrement(key);
            if (this.memoryStore) return this.memoryStore.decrement(key);
        },
        resetKey: async function (key) {
            if (this.redisStore) return this.redisStore.resetKey(key);
            if (this.memoryStore) return this.memoryStore.resetKey(key);
        }
    };
};

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: getLimiterStore()
});

// Stricter rate limiting for login (brute-force protection)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 login attempts per windowMs
    message: {
        success: false,
        message: 'Too many login attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: getLimiterStore()
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

// @route   POST /api/auth/register
// @desc    Register new user (always creates as 'employee' role)
// @access  Public
router.post('/register',
    authLimiter,
    [
        body('email')
            .isEmail().withMessage('Please enter a valid email')
            .normalizeEmail(),
        body('password')
            .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .withMessage('Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number'),
    ],
    validate,
    async (req, res) => {
        try {
            const { email, password } = req.body;

            // Check if user exists
            const userExists = await User.findOne({ email });
            if (userExists) {
                return res.status(400).json({
                    success: false,
                    message: 'User already exists'
                });
            }

            // SECURITY: Always create with 'employee' role — role escalation must be done by SuperAdmin
            const user = await User.create({
                email,
                password,
                role: 'employee'
            });

            const token = generateToken(user._id);

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            res.status(201).json({
                success: true,
                data: {
                    _id: user._id,
                    email: user.email,
                    role: user.role
                }
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: 'User already exists'
                });
            }
            res.status(500).json({
                success: false,
                message: 'Registration failed. Please try again.'
            });
        }
    }
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login',
    loginLimiter,
    [
        body('email')
            .isEmail().withMessage('Please enter a valid email')
            .normalizeEmail(),
        body('password')
            .notEmpty().withMessage('Password is required'),
    ],
    validate,
    async (req, res) => {
        try {
            const { email, password } = req.body;

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

            const token = generateToken(user._id);

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

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
