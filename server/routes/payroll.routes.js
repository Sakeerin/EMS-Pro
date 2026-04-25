import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { BUSINESS_RULES } from '../config/constants.js';
import Payroll from '../models/Payroll.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
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

// @route   GET /api/payroll
// @desc    Get all payroll records
// @access  Private (Admin, HR)
router.get('/', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const { month, year, status } = req.query;

        let query = {};
        if (month) query.month = parseInt(month);
        if (year) query.year = parseInt(year);
        if (status) query.status = status;

        const payrolls = await Payroll.find(query)
            .populate('employee', 'firstName lastName employeeId department')
            .sort({ year: -1, month: -1 });

        res.json({
            success: true,
            data: payrolls
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/payroll/my
// @desc    Get my payroll records
// @access  Private
router.get('/my', protect, async (req, res) => {
    try {
        if (!req.user.employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        const payrolls = await Payroll.find({
            employee: req.user.employee,
            status: { $in: ['approved', 'paid'] }
        }).sort({ year: -1, month: -1 });

        res.json({
            success: true,
            data: payrolls
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   POST /api/payroll/generate
// @desc    Generate payroll for a month
// @access  Private (Admin, HR)
router.post('/generate',
    protect,
    authorize('superadmin', 'admin'),
    [
        body('month')
            .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
        body('year')
            .isInt({ min: 2000, max: 2100 }).withMessage('Invalid year'),
    ],
    validate,
    async (req, res) => {
    try {
        const { month, year } = req.body;

        // Get all active employees
        const employees = await Employee.find({ status: 'active' });
        const employeeIds = employees.map(e => e._id);

        // BATCH: Get all existing payrolls for this month/year in one query
        const existingPayrolls = await Payroll.find({
            employee: { $in: employeeIds },
            month,
            year
        }).select('employee');
        const existingEmployeeIds = new Set(existingPayrolls.map(p => p.employee.toString()));

        // Filter out employees who already have payroll
        const employeesToProcess = employees.filter(e => !existingEmployeeIds.has(e._id.toString()));

        if (employeesToProcess.length === 0) {
            return res.json({
                success: true,
                message: 'Payroll already generated for all employees this month',
                data: []
            });
        }

        // BATCH: Get all attendance records for the month in one query
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const allAttendance = await Attendance.find({
            employee: { $in: employeesToProcess.map(e => e._id) },
            date: { $gte: startDate, $lte: endDate }
        });

        // Group attendance by employee ID for fast lookup
        const attendanceByEmployee = new Map();
        allAttendance.forEach(record => {
            const empId = record.employee.toString();
            if (!attendanceByEmployee.has(empId)) {
                attendanceByEmployee.set(empId, []);
            }
            attendanceByEmployee.get(empId).push(record);
        });

        // Build payroll records — use Payroll.create() per record so pre-save hooks run
        const payrollRecords = [];
        for (const employee of employeesToProcess) {
            const empAttendance = attendanceByEmployee.get(employee._id.toString()) || [];
            const workingDays = empAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
            const overtimeHours = empAttendance.reduce((sum, a) => sum + (a.overtime || 0), 0);
            const lateDays = empAttendance.filter(a => a.status === 'late').length;

            const payroll = await Payroll.create({
                employee: employee._id,
                month,
                year,
                baseSalary: employee.salary,
                workingDays,
                overtime: {
                    hours: overtimeHours,
                    rate: BUSINESS_RULES.OVERTIME_MULTIPLIER
                },
                deductions: {
                    socialSecurity: Math.min(employee.salary * BUSINESS_RULES.SOCIAL_SECURITY_RATE, BUSINESS_RULES.SOCIAL_SECURITY_CAP),
                    lateDeduction: lateDays * BUSINESS_RULES.LATE_DEDUCTION_PENALTY
                }
            });

            payrollRecords.push(payroll);
        }

        res.status(201).json({
            success: true,
            message: `Generated payroll for ${payrollRecords.length} employees`,
            data: payrollRecords
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate payroll'
        });
    }
});

// @route   GET /api/payroll/:id
// @desc    Get payroll by ID (payslip)
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const payroll = await Payroll.findById(req.params.id)
            .populate({
                path: 'employee',
                select: 'firstName lastName employeeId email department position bankAccount',
                populate: { path: 'department', select: 'name' }
            });

        if (!payroll) {
            return res.status(404).json({
                success: false,
                message: 'Payroll record not found'
            });
        }

        // Check authorization
        if (req.user.role === 'employee' && payroll.employee._id.toString() !== req.user.employee?.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this payslip'
            });
        }

        res.json({
            success: true,
            data: payroll
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   PUT /api/payroll/:id
// @desc    Update payroll record
// @access  Private (Admin, HR)
router.put('/:id', protect, authorize('superadmin', 'admin'), async (req, res) => {
    try {
        const payroll = await Payroll.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!payroll) {
            return res.status(404).json({
                success: false,
                message: 'Payroll record not found'
            });
        }

        res.json({
            success: true,
            data: payroll
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   PUT /api/payroll/:id/approve
// @desc    Approve payroll
// @access  Private (Admin)
router.put('/:id/approve', protect, authorize('superadmin', 'admin'), async (req, res) => {
    try {
        const payroll = await Payroll.findByIdAndUpdate(
            req.params.id,
            { status: 'approved' },
            { new: true }
        );

        if (!payroll) {
            return res.status(404).json({
                success: false,
                message: 'Payroll record not found'
            });
        }

        res.json({
            success: true,
            message: 'Payroll approved',
            data: payroll
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   PUT /api/payroll/:id/pay
// @desc    Mark payroll as paid
// @access  Private (Admin)
router.put('/:id/pay', protect, authorize('superadmin', 'admin'), async (req, res) => {
    try {
        const payroll = await Payroll.findByIdAndUpdate(
            req.params.id,
            {
                status: 'paid',
                paymentDate: new Date()
            },
            { new: true }
        );

        if (!payroll) {
            return res.status(404).json({
                success: false,
                message: 'Payroll record not found'
            });
        }

        res.json({
            success: true,
            message: 'Payroll marked as paid',
            data: payroll
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
