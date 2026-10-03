import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { BUSINESS_RULES } from '../config/constants.js';
import Payroll from '../models/Payroll.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import { protect, authorize } from '../middleware/auth.js';
import { objectIdParam } from '../middleware/validators.js';

// What an admin may adjust on a payroll before it's approved; everything else
// (base salary, approved overtime, social security, late deductions and the
// totals) is calculated by the system
const EDITABLE_FIELDS = {
    bonus: true,
    allowances: ['housing', 'transport', 'meal', 'other'],
    deductions: ['tax', 'providentFund', 'other'],
    notes: true,
    paymentMethod: true
};

// Body keys outside EDITABLE_FIELDS, as dotted paths
const nonEditableFields = (body) => Object.entries(body).flatMap(([key, value]) => {
    const allowed = EDITABLE_FIELDS[key];
    if (!allowed) return [key];
    if (Array.isArray(allowed)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [key];
        return Object.keys(value).filter(sub => !allowed.includes(sub)).map(sub => `${key}.${sub}`);
    }
    return [];
});

const isOwnPayroll = (req, payroll) => Boolean(req.user.employee) && payroll.employee.equals(req.user.employee);

// Payroll saves are version-checked, so two admins acting on the same record at
// once can't, say, approve it while an edit lands
const sendPayrollWriteError = (res, error, fallback) => {
    if (error.name === 'VersionError') {
        return res.status(409).json({
            success: false,
            message: 'This payroll was changed by someone else. Reload and try again.'
        });
    }
    res.status(500).json({ success: false, message: fallback });
};

const payrollIdParam = objectIdParam('id', 'Invalid payroll ID');

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

        // Only overtime HR has approved is paid; pending overtime is reported back
        const pendingOvertime = allAttendance.filter(a => a.overtimeStatus === 'pending').length;

        // Build payroll records using batch processing
        const payrollPayloads = [];
        for (const employee of employeesToProcess) {
            const empAttendance = attendanceByEmployee.get(employee._id.toString()) || [];
            const workingDays = empAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
            const overtimeHours = empAttendance
                .filter(a => a.overtimeStatus === 'approved')
                .reduce((sum, a) => sum + (a.overtime || 0), 0);
            const lateDays = empAttendance.filter(a => a.status === 'late').length;

            const rawPayload = {
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
            };
            
            // Apply business calculations
            Payroll.calculateTotals(rawPayload);
            payrollPayloads.push(rawPayload);
        }

        // BATCH: Insert all records at once (drastically faster than loop)
        let payrollRecords = [];
        if (payrollPayloads.length > 0) {
            payrollRecords = await Payroll.insertMany(payrollPayloads);
        }

        const pendingNote = pendingOvertime > 0
            ? ` (${pendingOvertime} overtime ${pendingOvertime === 1 ? 'entry was' : 'entries were'} still pending approval and not paid)`
            : '';
        res.status(201).json({
            success: true,
            message: `Generated payroll for ${payrollRecords.length} employees${pendingNote}`,
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
router.get('/:id', protect, [payrollIdParam], validate, async (req, res) => {
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
// @desc    Adjust a draft payroll (bonus, allowances, tax and other deductions,
//          notes, payment method); totals are recalculated
// @access  Private (Admin)
router.put('/:id',
    protect,
    authorize('superadmin', 'admin'),
    [
        payrollIdParam,
        body(['bonus', 'allowances.*', 'deductions.*'])
            .optional()
            .isFloat({ min: 0 }).withMessage('Amounts must be numbers of 0 or more'),
        body('notes')
            .optional()
            .isString().isLength({ max: 1000 }).withMessage('Notes must be text of at most 1000 characters'),
        body('paymentMethod')
            .optional()
            .isIn(['bank_transfer', 'cash', 'cheque']).withMessage('Invalid payment method'),
    ],
    validate,
    async (req, res) => {
    try {
        const refused = nonEditableFields(req.body);
        if (refused.length > 0) {
            return res.status(400).json({
                success: false,
                message: `These fields can't be changed: ${refused.join(', ')}`
            });
        }

        const payroll = await Payroll.findById(req.params.id);

        if (!payroll) {
            return res.status(404).json({
                success: false,
                message: 'Payroll record not found'
            });
        }

        if (!['draft', 'pending'].includes(payroll.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only draft payroll can be changed'
            });
        }

        if (isOwnPayroll(req, payroll)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot change your own payroll'
            });
        }

        // Set field by field so untouched allowances and deductions keep their values
        const { bonus, allowances = {}, deductions = {}, notes, paymentMethod } = req.body;
        if (bonus !== undefined) payroll.bonus = Number(bonus);
        for (const [key, value] of Object.entries(allowances)) payroll.set(`allowances.${key}`, Number(value));
        for (const [key, value] of Object.entries(deductions)) payroll.set(`deductions.${key}`, Number(value));
        if (notes !== undefined) payroll.notes = notes;
        if (paymentMethod !== undefined) payroll.paymentMethod = paymentMethod;
        await payroll.save(); // recalculates the totals

        res.json({
            success: true,
            data: payroll
        });
    } catch (error) {
        sendPayrollWriteError(res, error, 'Failed to update payroll');
    }
});

// @route   PUT /api/payroll/:id/approve
// @desc    Approve payroll
// @access  Private (Admin)
router.put('/:id/approve', protect, authorize('superadmin', 'admin'), [payrollIdParam], validate, async (req, res) => {
    try {
        const payroll = await Payroll.findById(req.params.id);

        if (!payroll) {
            return res.status(404).json({
                success: false,
                message: 'Payroll record not found'
            });
        }

        if (!['draft', 'pending'].includes(payroll.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only draft payroll can be approved'
            });
        }

        if (isOwnPayroll(req, payroll)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve your own payroll'
            });
        }

        payroll.status = 'approved';
        await payroll.save();

        res.json({
            success: true,
            message: 'Payroll approved',
            data: payroll
        });
    } catch (error) {
        sendPayrollWriteError(res, error, 'Failed to approve payroll');
    }
});

// @route   PUT /api/payroll/:id/pay
// @desc    Mark approved payroll as paid
// @access  Private (Admin)
router.put('/:id/pay', protect, authorize('superadmin', 'admin'), [payrollIdParam], validate, async (req, res) => {
    try {
        const payroll = await Payroll.findById(req.params.id);

        if (!payroll) {
            return res.status(404).json({
                success: false,
                message: 'Payroll record not found'
            });
        }

        if (payroll.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Only approved payroll can be marked as paid'
            });
        }

        if (isOwnPayroll(req, payroll)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot mark your own payroll as paid'
            });
        }

        payroll.status = 'paid';
        payroll.paymentDate = new Date();
        await payroll.save();

        res.json({
            success: true,
            message: 'Payroll marked as paid',
            data: payroll
        });
    } catch (error) {
        sendPayrollWriteError(res, error, 'Failed to mark payroll as paid');
    }
});

export default router;
