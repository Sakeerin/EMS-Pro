import express from 'express';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import { protect, authorize, canManageUsers } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and SuperAdmin role
router.use(protect);
router.use(authorize('superadmin'));

// @route   GET /api/users
// @desc    Get all users with pagination and filtering
// @access  SuperAdmin only
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search, role, status } = req.query;

        // Build query
        const query = {};

        if (search) {
            query.email = { $regex: search, $options: 'i' };
        }

        if (role) {
            query.role = role;
        }

        if (status) {
            query.isActive = status === 'active';
        }

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .select('-password')
            .populate('employee', 'firstName lastName employeeId position')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: users,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/users/:id
// @desc    Get single user by ID
// @access  SuperAdmin only
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .populate('employee');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   POST /api/users
// @desc    Create new user
// @access  SuperAdmin only
router.post('/', async (req, res) => {
    try {
        const { email, password, role, employeeId } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Validate role
        const validRoles = ['superadmin', 'admin', 'hr', 'employee'];
        if (role && !validRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role specified'
            });
        }

        // Create user
        const userData = {
            email,
            password,
            role: role || 'employee'
        };

        // Link to employee if provided
        if (employeeId) {
            const employee = await Employee.findById(employeeId);
            if (!employee) {
                return res.status(404).json({
                    success: false,
                    message: 'Employee not found'
                });
            }
            userData.employee = employeeId;
        }

        const user = await User.create(userData);

        res.status(201).json({
            success: true,
            data: {
                _id: user._id,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                employee: user.employee
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  SuperAdmin only
router.put('/:id', async (req, res) => {
    try {
        const { email, role, isActive } = req.body;
        const userId = req.params.id;

        // Prevent modifying own account role
        if (userId === req.user._id.toString() && role && role !== req.user.role) {
            return res.status(400).json({
                success: false,
                message: 'Cannot modify your own role'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update fields
        if (email) user.email = email;
        if (role) user.role = role;
        if (typeof isActive === 'boolean') user.isActive = isActive;

        await user.save();

        res.json({
            success: true,
            data: {
                _id: user._id,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   PUT /api/users/:id/link-employee
// @desc    Link user to an employee profile
// @access  SuperAdmin only
router.put('/:id/link-employee', async (req, res) => {
    try {
        const { employeeId } = req.body;
        const userId = req.params.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (employeeId) {
            // Check if employee exists
            const employee = await Employee.findById(employeeId);
            if (!employee) {
                return res.status(404).json({
                    success: false,
                    message: 'Employee not found'
                });
            }

            // Check if employee is already linked to another user
            const existingLink = await User.findOne({
                employee: employeeId,
                _id: { $ne: userId }
            });
            if (existingLink) {
                return res.status(400).json({
                    success: false,
                    message: 'This employee is already linked to another user account'
                });
            }

            user.employee = employeeId;
        } else {
            // Unlink employee
            user.employee = null;
        }

        await user.save();

        const updatedUser = await User.findById(userId)
            .select('-password')
            .populate('employee', 'firstName lastName employeeId position');

        res.json({
            success: true,
            data: updatedUser
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   DELETE /api/users/:id
// @desc    Deactivate user (soft delete)
// @access  SuperAdmin only
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent deleting own account
        if (userId === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot deactivate your own account'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Soft delete - just deactivate
        user.isActive = false;
        await user.save();

        res.json({
            success: true,
            message: 'User deactivated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/users/employees/unlinked
// @desc    Get employees not linked to any user
// @access  SuperAdmin only
router.get('/employees/unlinked', async (req, res) => {
    try {
        // Get all employee IDs that are linked to users
        const linkedEmployeeIds = await User.distinct('employee', { employee: { $ne: null } });

        // Find employees not in that list
        const unlinkedEmployees = await Employee.find({
            _id: { $nin: linkedEmployeeIds },
            status: 'active'
        }).select('firstName lastName employeeId email position');

        res.json({
            success: true,
            data: unlinkedEmployees
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
