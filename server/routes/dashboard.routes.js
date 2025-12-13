import express from 'express';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Payroll from '../models/Payroll.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics
// @access  Private (Admin, HR)
router.get('/stats', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        // Employee stats
        const totalEmployees = await Employee.countDocuments({ status: 'active' });
        const newEmployeesThisMonth = await Employee.countDocuments({
            status: 'active',
            createdAt: { $gte: new Date(new Date().setDate(1)) }
        });

        // Today's attendance
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayAttendance = await Attendance.countDocuments({ date: today });
        const presentToday = await Attendance.countDocuments({
            date: today,
            status: { $in: ['present', 'late'] }
        });
        const lateToday = await Attendance.countDocuments({ date: today, status: 'late' });

        // Pending leaves
        const pendingLeaves = await Leave.countDocuments({ status: 'pending' });

        // Department distribution
        const departmentStats = await Employee.aggregate([
            { $match: { status: 'active' } },
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
            { $unwind: '$department' },
            {
                $project: {
                    name: '$department.name',
                    count: 1
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Monthly attendance trend (last 7 days)
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const count = await Attendance.countDocuments({
                date: { $gte: date, $lt: nextDate },
                status: { $in: ['present', 'late'] }
            });

            last7Days.push({
                date: date.toISOString().split('T')[0],
                present: count
            });
        }

        // Leave statistics
        const leaveStats = await Leave.aggregate([
            {
                $match: {
                    startDate: { $gte: new Date(new Date().getFullYear(), 0, 1) }
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Payroll summary (current month)
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const payrollSummary = await Payroll.aggregate([
            {
                $match: { month: currentMonth, year: currentYear }
            },
            {
                $group: {
                    _id: null,
                    totalGross: { $sum: '$grossSalary' },
                    totalNet: { $sum: '$netSalary' },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                employees: {
                    total: totalEmployees,
                    newThisMonth: newEmployeesThisMonth
                },
                attendance: {
                    total: todayAttendance,
                    present: presentToday,
                    late: lateToday,
                    absent: totalEmployees - presentToday,
                    rate: totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100) : 0
                },
                leaves: {
                    pending: pendingLeaves,
                    stats: leaveStats
                },
                departments: departmentStats,
                attendanceTrend: last7Days,
                payroll: payrollSummary[0] || { totalGross: 0, totalNet: 0, count: 0 }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/dashboard/recent-activities
// @desc    Get recent activities
// @access  Private (Admin, HR)
router.get('/recent-activities', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        // Recent employees
        const recentEmployees = await Employee.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('firstName lastName employeeId createdAt');

        // Recent leaves
        const recentLeaves = await Leave.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('employee', 'firstName lastName')
            .select('type status startDate endDate createdAt');

        // Recent attendance
        const recentAttendance = await Attendance.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('employee', 'firstName lastName');

        res.json({
            success: true,
            data: {
                employees: recentEmployees,
                leaves: recentLeaves,
                attendance: recentAttendance
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
