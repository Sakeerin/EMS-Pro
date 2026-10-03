import mongoose from 'mongoose';
import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';
import { countBusinessDays, inYear } from '../utils/leaveDays.js';

// Leave dates are stored as UTC midnight of the chosen day, so compare calendar
// dates: leave starting today counts as started
const hasStarted = (leave) => leave.startDate.toISOString().slice(0, 10) <= new Date().toLocaleDateString('en-CA');

// Approvers can't decide on their own requests
const isOwnLeave = (req, leave) => Boolean(req.user.employee) && leave.employee.equals(req.user.employee);

// Why a requested date range can't be accepted, or null. Quotas are yearly, so a
// request stays within one calendar year, from last year to next year
const leaveDateProblem = (start, end) => {
    if (start > end) return 'Start date must be before or equal to end date';
    const year = start.getUTCFullYear();
    if (end.getUTCFullYear() !== year) {
        return "A leave request can't span two calendar years. Submit one request for each year.";
    }
    const thisYear = new Date().getFullYear();
    if (year < thisYear - 1 || year > thisYear + 1) {
        return `Leave dates must be between ${thisYear - 1} and ${thisYear + 1}`;
    }
    return null;
};

// @desc    Get all leave requests (Admin/HR sees all, employees see their own)
export const getLeaves = async (req, res) => {
    try {
        const { status, type, startDate, endDate } = req.query;

        let query = {};

        // If not admin/hr, only show own leaves; an account without an employee
        // profile has none (it used to skip the filter and see everyone's)
        if (!['superadmin', 'admin', 'hr'].includes(req.user.role)) {
            if (!req.user.employee) {
                return res.json({ success: true, data: [] });
            }
            query.employee = req.user.employee;
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
};

// @desc    Get my leave requests
export const getMyLeaves = async (req, res) => {
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
};

// @desc    Get leave balance
export const getLeaveBalance = async (req, res) => {
    try {
        if (!req.user.employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // This year unless ?year= asks for another (e.g. to plan next year's leave)
        const year = req.query.year === undefined ? new Date().getFullYear() : Number(req.query.year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            return res.status(400).json({
                success: false,
                message: 'Invalid year'
            });
        }

        const employee = await Employee.findById(req.user.employee);

        // Leave approved in that year (a request never spans two years)
        const usedLeaves = await Leave.aggregate([
            {
                $match: {
                    employee: employee._id,
                    status: 'approved',
                    startDate: inYear(year)
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
            year,
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
};

// @desc    Create leave request
export const createLeaveRequest = async (req, res) => {
    const { type, startDate, endDate, reason, employeeId } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Checked first: keeping a request within one year also bounds the day count below
    const dateProblem = leaveDateProblem(start, end);
    if (dateProblem) {
        return res.status(400).json({
            success: false,
            message: dateProblem
        });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        let employee;
        if (employeeId && ['superadmin', 'admin', 'hr'].includes(req.user.role)) {
            employee = await Employee.findOneAndUpdate(
                { _id: employeeId },
                { $inc: { leaveRequestVersion: 1 } },
                { new: true, session }
            );
        } else if (req.user.employee) {
            employee = await Employee.findOneAndUpdate(
                { _id: req.user.employee },
                { $inc: { leaveRequestVersion: 1 } },
                { new: true, session }
            );
        }

        if (!employee) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Refuse dates that overlap a request already pending or approved (also
        // stops a double-submitted form from charging the balance twice)
        const overlapping = await Leave.exists({
            employee: employee._id,
            status: { $in: ['pending', 'approved'] },
            startDate: { $lte: end },
            endDate: { $gte: start }
        }).session(session);
        if (overlapping) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'You already have a leave request that overlaps these dates'
            });
        }

        const businessDays = countBusinessDays(start, end);

        if (businessDays === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Leave duration must include at least one business day'
            });
        }

        // Check balance for constrained leave types, against the quota of the
        // year the leave is in
        if (['annual', 'sick', 'personal'].includes(type)) {
            const usedLeaves = await Leave.aggregate([
                {
                    $match: {
                        employee: employee._id,
                        status: { $in: ['approved', 'pending'] }, // include pending to prevent overdraft
                        startDate: inYear(start.getUTCFullYear()),
                        type: type
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalDays: { $sum: '$days' }
                    }
                }
            ]).session(session);

            const usedDays = usedLeaves.length > 0 ? usedLeaves[0].totalDays : 0;
            const totalBalance = employee.leaveBalance ? employee.leaveBalance[type] : 0;

            if (usedDays + businessDays > totalBalance) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({
                    success: false,
                    message: `Insufficient ${type} leave balance. You have ${totalBalance - usedDays} days remaining in ${start.getUTCFullYear()}.`
                });
            }
        }

        const leave = new Leave({
            employee: employee._id,
            type,
            startDate: start,
            endDate: end,
            reason
        });
        await leave.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            data: leave
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({
            success: false,
            message: 'Failed to create leave request'
        });
    }
};

// @desc    Approve leave request
export const approveLeaveRequest = async (req, res) => {
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

        if (isOwnLeave(req, leave)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve or reject your own leave request'
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
};

// @desc    Reject leave request
export const rejectLeaveRequest = async (req, res) => {
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

        if (isOwnLeave(req, leave)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve or reject your own leave request'
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
};

// @desc    Cancel leave request
export const cancelLeaveRequest = async (req, res) => {
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

        // HR/admin roles can cancel any leave (corrections); employees only their own
        const isHR = ['superadmin', 'admin', 'hr'].includes(req.user.role);
        if (!isHR && leave.employee.toString() !== req.user.employee?.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to cancel this leave'
            });
        }

        // Once approved leave has started the days are taken, so cancelling it
        // would refund them; employees need HR for that
        if (!isHR && leave.status === 'approved' && hasStarted(leave)) {
            return res.status(403).json({
                success: false,
                message: 'This leave has already started. Ask HR to cancel it.'
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
};
