import express from 'express';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure multer for avatar upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/avatars');
    },
    filename: (req, file, cb) => {
        cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    }
});

// @route   GET /api/employees
// @desc    Get all employees with pagination, search, filter
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Build query
        let query = {};

        // Search
        if (req.query.search) {
            query.$text = { $search: req.query.search };
        }

        // Filter by department
        if (req.query.department) {
            query.department = req.query.department;
        }

        // Filter by status
        if (req.query.status) {
            query.status = req.query.status;
        }

        // Get total count
        const total = await Employee.countDocuments(query);

        // Get employees
        const employees = await Employee.find(query)
            .populate('department', 'name code')
            .populate('manager', 'firstName lastName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            data: employees,
            pagination: {
                page,
                limit,
                total,
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

// @route   GET /api/employees/:id
// @desc    Get employee by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id)
            .populate('department', 'name code')
            .populate('manager', 'firstName lastName email');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            data: employee
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   POST /api/employees
// @desc    Create new employee
// @access  Private (Admin, HR)
router.post('/', protect, authorize('admin', 'hr'), async (req, res) => {
    try {
        const employee = await Employee.create(req.body);

        // Create user account if email provided
        if (req.body.createUser && req.body.email) {
            const user = await User.create({
                email: req.body.email,
                password: req.body.password || 'password123', // Default password
                role: 'employee',
                employee: employee._id
            });
        }

        res.status(201).json({
            success: true,
            data: employee
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private (Admin, HR)
router.put('/:id', protect, authorize('admin', 'hr'), async (req, res) => {
    try {
        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('department', 'name code');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            data: employee
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   DELETE /api/employees/:id
// @desc    Delete employee
// @access  Private (Admin)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const employee = await Employee.findByIdAndDelete(req.params.id);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Also delete associated user account
        await User.findOneAndDelete({ employee: req.params.id });

        res.json({
            success: true,
            message: 'Employee deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   POST /api/employees/:id/avatar
// @desc    Upload employee avatar
// @access  Private
router.post('/:id/avatar', protect, upload.single('avatar'), async (req, res) => {
    try {
        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            { avatar: `/uploads/avatars/${req.file.filename}` },
            { new: true }
        );

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            data: employee
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/employees/stats/overview
// @desc    Get employee statistics
// @access  Private
router.get('/stats/overview', protect, async (req, res) => {
    try {
        const stats = await Employee.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const departmentStats = await Employee.aggregate([
            {
                $group: {
                    _id: '$department',
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'department'
                }
            },
            {
                $unwind: '$department'
            },
            {
                $project: {
                    name: '$department.name',
                    count: 1
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                statusStats: stats,
                departmentStats
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
