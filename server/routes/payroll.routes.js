import express from 'express';
import Payroll from '../models/Payroll.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import { protect, authorize } from '../middleware/auth.js';

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
router.post('/generate', protect, authorize('superadmin', 'admin'), async (req, res) => {
    try {
        const { month, year } = req.body;

        // Get all active employees
        const employees = await Employee.find({ status: 'active' });

        const payrollRecords = [];

        for (const employee of employees) {
            // Check if payroll already exists
            const existingPayroll = await Payroll.findOne({
                employee: employee._id,
                month,
                year
            });

            if (existingPayroll) continue;

            // Calculate attendance for the month
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);

            const attendanceRecords = await Attendance.find({
                employee: employee._id,
                date: { $gte: startDate, $lte: endDate }
            });

            const workingDays = attendanceRecords.filter(a => a.status === 'present' || a.status === 'late').length;
            const overtimeHours = attendanceRecords.reduce((sum, a) => sum + (a.overtime || 0), 0);
            const lateDays = attendanceRecords.filter(a => a.status === 'late').length;

            // Calculate payroll
            const payroll = await Payroll.create({
                employee: employee._id,
                month,
                year,
                baseSalary: employee.salary,
                workingDays,
                overtime: {
                    hours: overtimeHours,
                    rate: 1.5
                },
                deductions: {
                    socialSecurity: Math.min(employee.salary * 0.05, 750), // 5% max 750
                    lateDeduction: lateDays * 100 // 100 baht per late day
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
            message: error.message
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
