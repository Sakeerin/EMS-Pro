import express from 'express';
import { body, param, validationResult } from 'express-validator';
import Department from '../models/Department.js';
import { protect, authorize } from '../middleware/auth.js';

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

const router = express.Router();

// @route   GET /api/departments
// @desc    Get all departments
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const departments = await Department.find({ isActive: true })
            .populate('manager', 'firstName lastName')
            .populate('employeeCount');

        res.json({
            success: true,
            data: departments
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/departments/:id
// @desc    Get department by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const department = await Department.findById(req.params.id)
            .populate('manager', 'firstName lastName email')
            .populate('parentDepartment', 'name code');

        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found'
            });
        }

        res.json({
            success: true,
            data: department
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   POST /api/departments
// @desc    Create new department
// @access  Private (Admin)
router.post('/',
    protect,
    authorize('superadmin', 'admin', 'hr'),
    [
        body('name').notEmpty().withMessage('Department name is required').trim(),
        body('code').notEmpty().withMessage('Department code is required').trim(),
        body('manager').optional().isMongoId().withMessage('Invalid manager ID'),
        body('budget').optional().isFloat({ min: 0 }).withMessage('Budget must be a positive number'),
    ],
    validate,
    async (req, res) => {
        try {
            const department = await Department.create(req.body);

            res.status(201).json({
                success: true,
                data: department
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: 'Department name or code already exists'
                });
            }
            res.status(500).json({
                success: false,
                message: 'Failed to create department'
            });
        }
    }
);

// @route   PUT /api/departments/:id
// @desc    Update department
// @access  Private (Admin)
router.put('/:id', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const department = await Department.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found'
            });
        }

        res.json({
            success: true,
            data: department
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   DELETE /api/departments/:id
// @desc    Delete department (soft delete)
// @access  Private (Admin)
router.delete('/:id', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const department = await Department.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found'
            });
        }

        res.json({
            success: true,
            message: 'Department deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
