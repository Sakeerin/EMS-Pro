import express from 'express';
import { body, validationResult } from 'express-validator';
import Attendance from '../models/Attendance.js';
import { BUSINESS_RULES } from '../config/constants.js';
import Employee from '../models/Employee.js';
import { protect, authorize } from '../middleware/auth.js';
import { objectIdParam } from '../middleware/validators.js';

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

const HR_ROLES = ['superadmin', 'admin', 'hr'];

// HR/admin roles may record attendance for any employee (corrections), via
// body.employeeId; everyone else always records their own, whatever the body says
const attendanceTargetId = (req) =>
    req.body.employeeId && HR_ROLES.includes(req.user.role) ? req.body.employeeId : req.user.employee;

const isObjectIdString = (value) => Boolean(value) && /^[0-9a-fA-F]{24}$/.test(String(value));

// @route   POST /api/attendance/check-in
// @desc    Check in for the day
// @access  Private
router.post('/check-in', protect, async (req, res) => {
    try {
        const { location, note } = req.body;

        const targetId = attendanceTargetId(req);
        if (!isObjectIdString(targetId)) {
            return res.status(targetId ? 400 : 404).json({
                success: false,
                message: targetId ? 'Invalid employee ID' : 'Employee not found'
            });
        }
        const employee = await Employee.findById(targetId);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if already checked in today
        let attendance = await Attendance.findOne({
            employee: employee._id,
            date: today
        });

        if (attendance && attendance.checkIn?.time) {
            return res.status(400).json({
                success: false,
                message: 'Already checked in today'
            });
        }

        const now = new Date();
        const checkInTime = now;

        // Determine status (late if after threshold)
        const threshold = new Date(today);
        threshold.setHours(
            BUSINESS_RULES?.LATE_THRESHOLD_HOUR || 9,
            BUSINESS_RULES?.LATE_THRESHOLD_MINUTE || 0,
            0, 0
        );
        const status = now > threshold ? 'late' : 'present';

        if (attendance) {
            attendance.checkIn = { time: checkInTime, location, note };
            attendance.status = status;
            await attendance.save();
        } else {
            attendance = await Attendance.create({
                employee: employee._id,
                date: today,
                checkIn: { time: checkInTime, location, note },
                status
            });
        }

        res.status(201).json({
            success: true,
            message: 'Checked in successfully',
            data: attendance
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   POST /api/attendance/check-out
// @desc    Check out for the day
// @access  Private
router.post('/check-out', protect, async (req, res) => {
    try {
        const { location, note } = req.body;

        const targetId = attendanceTargetId(req);
        if (!isObjectIdString(targetId)) {
            return res.status(targetId ? 400 : 404).json({
                success: false,
                message: targetId ? 'Invalid employee ID' : 'Employee not found'
            });
        }
        const employee = await Employee.findById(targetId);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const attendance = await Attendance.findOne({
            employee: employee._id,
            date: today
        });

        if (!attendance || !attendance.checkIn?.time) {
            return res.status(400).json({
                success: false,
                message: 'Please check in first'
            });
        }

        if (attendance.checkOut?.time) {
            return res.status(400).json({
                success: false,
                message: 'Already checked out today'
            });
        }

        attendance.checkOut = { time: new Date(), location, note };
        await attendance.save();

        res.json({
            success: true,
            message: 'Checked out successfully',
            data: attendance
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/attendance/my
// @desc    Get my attendance records
// @access  Private
router.get('/my', protect, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let employee;
        if (req.user.employee) {
            employee = await Employee.findById(req.user.employee);
        }

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        let query = { employee: employee._id };

        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const attendance = await Attendance.find(query)
            .sort({ date: -1 })
            .limit(31);

        res.json({
            success: true,
            data: attendance
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/attendance/today
// @desc    Get today's attendance status
// @access  Private
router.get('/today', protect, async (req, res) => {
    try {
        // If user has no employee profile, return default (e.g., SuperAdmin without employee link)
        if (!req.user.employee) {
            return res.json({
                success: true,
                data: { checkedIn: false, checkedOut: false, noEmployeeProfile: true }
            });
        }

        const employee = await Employee.findById(req.user.employee);
        if (!employee) {
            return res.json({
                success: true,
                data: { checkedIn: false, checkedOut: false, noEmployeeProfile: true }
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const attendance = await Attendance.findOne({
            employee: employee._id,
            date: today
        });

        res.json({
            success: true,
            data: attendance || { checkedIn: false, checkedOut: false }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch today\'s attendance'
        });
    }
});

// @route   GET /api/attendance/report
// @desc    Get attendance report for all employees
// @access  Private (Admin, HR, Manager)
router.get('/report', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const { startDate, endDate, department, page = 1, limit = 50 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit) || 50, 200); // Cap at 200
        const skip = (pageNum - 1) * limitNum;

        let employeeQuery = {};
        if (department) {
            employeeQuery.department = department;
        }

        const employees = await Employee.find(employeeQuery).select('_id');
        const employeeIds = employees.map(e => e._id);

        let attendanceQuery = { employee: { $in: employeeIds } };

        if (startDate && endDate) {
            attendanceQuery.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Run count, records, and summary in parallel
        const [total, attendance, summary] = await Promise.all([
            Attendance.countDocuments(attendanceQuery),
            Attendance.find(attendanceQuery)
                .populate('employee', 'firstName lastName employeeId department')
                .sort({ date: -1 })
                .skip(skip)
                .limit(limitNum),
            Attendance.aggregate([
                { $match: attendanceQuery },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        res.json({
            success: true,
            data: {
                records: attendance,
                summary,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum)
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate attendance report'
        });
    }
});

// @route   GET /api/attendance/overtime
// @desc    Overtime waiting for a decision (or ?status=approved|rejected)
// @access  Private (Admin, HR)
router.get('/overtime', protect, authorize(...HR_ROLES), async (req, res) => {
    try {
        const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';

        const records = await Attendance.find({ overtimeStatus: status })
            .populate('employee', 'firstName lastName employeeId')
            .sort({ date: -1 })
            .limit(200);

        res.json({
            success: true,
            data: records
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to load overtime'
        });
    }
});

// @route   PUT /api/attendance/:id/overtime
// @desc    Approve or reject a day's overtime
// @access  Private (Admin, HR)
router.put('/:id/overtime',
    protect,
    authorize(...HR_ROLES),
    [
        objectIdParam('id', 'Invalid attendance ID'),
        body('decision').isIn(['approve', 'reject']).withMessage('Decision must be approve or reject'),
    ],
    validate,
    async (req, res) => {
        try {
            const attendance = await Attendance.findById(req.params.id);

            if (!attendance) {
                return res.status(404).json({
                    success: false,
                    message: 'Attendance record not found'
                });
            }

            if (attendance.overtimeStatus !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'No overtime waiting for a decision on this record'
                });
            }

            // Approvers can't decide on their own overtime
            if (req.user.employee && attendance.employee.equals(req.user.employee)) {
                return res.status(403).json({
                    success: false,
                    message: 'You cannot approve or reject your own overtime'
                });
            }

            attendance.overtimeStatus = req.body.decision === 'approve' ? 'approved' : 'rejected';
            attendance.overtimeReviewedBy = req.user._id;
            attendance.overtimeReviewedAt = new Date();
            await attendance.save();

            res.json({
                success: true,
                message: `Overtime ${attendance.overtimeStatus}`,
                data: attendance
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to update overtime'
            });
        }
    }
);

export default router;
