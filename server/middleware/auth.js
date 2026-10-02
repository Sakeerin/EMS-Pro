import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// The only requests a user on a temporary password may make
const PASSWORD_CHANGE_ALLOWED = new Set([
    'GET /api/auth/me',
    'PUT /api/auth/password',
    'POST /api/auth/logout'
]);

// Protect routes - verify JWT token
export const protect = async (req, res, next) => {
    let token;

    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }

            if (!req.user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'Account is deactivated'
                });
            }

            if (req.user.mustChangePassword) {
                const path = req.originalUrl.split('?')[0];
                if (!PASSWORD_CHANGE_ALLOWED.has(`${req.method} ${path}`)) {
                    return res.status(403).json({
                        success: false,
                        code: 'PASSWORD_CHANGE_REQUIRED',
                        message: 'Password change required'
                    });
                }
            }

            return next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token failed'
            });
        }
    } else {
        return res.status(401).json({
            success: false,
            message: 'Not authorized, no token'
        });
    }
};

// Allows the listed roles, or the employee that the route's :id refers to
export const authorizeSelfOr = (...roles) => {
    return (req, res, next) => {
        if (roles.includes(req.user.role) || req.user.employee?.equals(req.params.id)) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Not authorized to change this employee'
        });
    };
};

// Role-based authorization
export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Role '${req.user.role}' is not authorized to access this resource`
            });
        }
        next();
    };
};

// Generate JWT token
export const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};

// Role helper functions
export const isSuperAdmin = (role) => role === 'superadmin';
export const isAdminOrAbove = (role) => ['superadmin', 'admin'].includes(role);
export const isHROrAbove = (role) => ['superadmin', 'admin', 'hr'].includes(role);

// Permission helper functions
export const canManageUsers = (role) => role === 'superadmin';
export const canDeleteEmployee = (role) => ['superadmin', 'admin'].includes(role);
export const canEditEmployee = (role) => ['superadmin', 'admin', 'hr'].includes(role);
export const canManageDepartments = (role) => ['superadmin', 'admin', 'hr'].includes(role);
export const canApproveLeaves = (role) => ['superadmin', 'admin', 'hr'].includes(role);
export const canManagePayroll = (role) => ['superadmin', 'admin'].includes(role);
