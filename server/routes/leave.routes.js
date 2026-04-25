import express from 'express';
import { body, param, validationResult } from 'express-validator';
import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';
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

// @route   GET /api/leaves
// @desc    Get all leave requests (Admin/HR sees all, employees see their own)
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const { status, type, startDate, endDate } = req.query;

        let query = {};

        // If not admin/hr, only show own leaves
        if (!['superadmin', 'admin', 'hr'].includes(req.user.role)) {
            if (req.user.employee) {
                query.employee = req.user.employee;
            }
        }

        if (status) query.status = status;
        if (type) query.type = type;

        if (startDate && endDate) {
            query.startDate = { $gte: new Date(startDate) };
            query.endDate = { $lte: new Date(endDate) };
        }

        const leaves = await Leave.find(query)
            .populate('employee', 'firstName lastName employeeId department')
            .populate('approvedBy', 'email')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: leaves
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/leaves/my
// @desc    Get my leave requests
// @access  Private
router.get('/my', protect, async (req, res) => {
    try {
        if (!req.user.employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        const leaves = await Leave.find({ employee: req.user.employee })
            .populate('approvedBy', 'email')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: leaves
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/leaves/balance
// @desc    Get leave balance
// @access  Private
router.get('/balance', protect, async (req, res) => {
    try {
        if (!req.user.employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        const employee = await Employee.findById(req.user.employee);

        // Calculate used leaves this year
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const endOfYear = new Date(new Date().getFullYear(), 11, 31);

        const usedLeaves = await Leave.aggregate([
            {
                $match: {
                    employee: employee._id,
                    status: 'approved',
                    startDate: { $gte: startOfYear, $lte: endOfYear }
                }
            },
            {
                $group: {
                    _id: '$type',
                    totalDays: { $sum: '$days' }
                }
            }
        ]);

        const balance = {
            annual: {
                total: employee.leaveBalance.annual,
                used: usedLeaves.find(l => l._id === 'annual')?.totalDays || 0
            },
            sick: {
                total: employee.leaveBalance.sick,
                used: usedLeaves.find(l => l._id === 'sick')?.totalDays || 0
            },
            personal: {
                total: employee.leaveBalance.personal,
                used: usedLeaves.find(l => l._id === 'personal')?.totalDays || 0
            }
        };

        balance.annual.remaining = balance.annual.total - balance.annual.used;
        balance.sick.remaining = balance.sick.total - balance.sick.used;
        balance.personal.remaining = balance.personal.total - balance.personal.used;

        res.json({
            success: true,
            data: balance
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   POST /api/leaves
// @desc    Create leave request
// @access  Private
router.post('/',
    protect,
    [
        body('type')
            .isIn(['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other'])
            .withMessage('Invalid leave type'),
        body('startDate')
            .isISO8601().withMessage('Valid start date is required'),
        body('endDate')
            .isISO8601().withMessage('Valid end date is required'),
        body('reason')
            .notEmpty().withMessage('Reason is required')
            .trim(),
        body('employeeId')
            .optional()
            .isMongoId().withMessage('Invalid employee ID'),
    ],
    validate,
    async (req, res) => {
        try {
            const { type, startDate, endDate, reason, employeeId } = req.body;

            // Validate date order
            if (new Date(startDate) > new Date(endDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Start date must be before or equal to end date'
                });
            }

            let employee;
            if (employeeId && ['superadmin', 'admin', 'hr'].includes(req.user.role)) {
                employee = await Employee.findById(employeeId);
            } else if (req.user.employee) {
                employee = await Employee.findById(req.user.employee);
            }

            if (!employee) {
                return res.status(404).json({
                    success: false,
                    message: 'Employee not found'
                });
            }

            // Calculate business days
            let businessDays = 0;
            let currentDate = new Date(startDate);
            currentDate.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(0, 0, 0, 0);
            
            while (currentDate <= end) {
                const dayOfWeek = currentDate.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    businessDays++;
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }

            if (businessDays === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Leave duration must include at least one business day'
                });
            }

            // Check balance for constrained leave types
            if (['annual', 'sick', 'personal'].includes(type)) {
                const startOfYear = new Date(new Date().getFullYear(), 0, 1);
                const endOfYear = new Date(new Date().getFullYear(), 11, 31);

                const usedLeaves = await Leave.aggregate([
                    {
                        $match: {
                            employee: employee._id,
                            status: { $in: ['approved', 'pending'] }, // include pending to prevent overdraft
                            startDate: { $gte: startOfYear, $lte: endOfYear },
                            type: type
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            totalDays: { $sum: '$days' }
                        }
                    }
                ]);

                const usedDays = usedLeaves.length > 0 ? usedLeaves[0].totalDays : 0;
                const totalBalance = employee.leaveBalance ? employee.leaveBalance[type] : 0;

                if (usedDays + businessDays > totalBalance) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient ${type} leave balance. You have ${totalBalance - usedDays} days remaining.`
                    });
                }
            }

            const leave = await Leave.create({
                employee: employee._id,
                type,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason
            });

            res.status(201).json({
                success: true,
                data: leave
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to create leave request'
            });
        }
    }
);

// @route   PUT /api/leaves/:id/approve
// @desc    Approve leave request
// @access  Private (Admin, HR, Manager)
router.put('/:id/approve', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: 'Leave request not found'
            });
        }

        if (leave.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Leave request is not pending'
            });
        }

        leave.status = 'approved';
        leave.approvedBy = req.user._id;
        leave.approvedAt = new Date();
        await leave.save();

        res.json({
            success: true,
            message: 'Leave request approved',
            data: leave
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   PUT /api/leaves/:id/reject
// @desc    Reject leave request
// @access  Private (Admin, HR, Manager)
router.put('/:id/reject', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const { reason } = req.body;
        const leave = await Leave.findById(req.params.id);

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: 'Leave request not found'
            });
        }

        if (leave.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Leave request is not pending'
            });
        }

        leave.status = 'rejected';
        leave.rejectionReason = reason;
        leave.approvedBy = req.user._id;
        leave.approvedAt = new Date();
        await leave.save();

        res.json({
            success: true,
            message: 'Leave request rejected',
            data: leave
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   DELETE /api/leaves/:id
// @desc    Cancel leave request
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: 'Leave request not found'
            });
        }

        // Only allow cancellation of pending or approved leaves
        if (!['pending', 'approved'].includes(leave.status)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel this leave request'
            });
        }

        // Check ownership unless admin
        if (!['superadmin', 'admin'].includes(req.user.role) && leave.employee.toString() !== req.user.employee?.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to cancel this leave'
            });
        }

        leave.status = 'cancelled';
        await leave.save();

        res.json({
            success: true,
            message: 'Leave request cancelled'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
