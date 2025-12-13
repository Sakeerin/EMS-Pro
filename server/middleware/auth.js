import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Protect routes - verify JWT token
export const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
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

            next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token failed'
            });
        }
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized, no token'
        });
    }
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
