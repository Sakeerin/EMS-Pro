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
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();

        // Calculate 7 days ago for attendance trend
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        // Run ALL independent queries in parallel using Promise.all
        const [
            totalEmployees,
            newEmployeesThisMonth,
            todayAttendance,
            presentToday,
            lateToday,
            pendingLeaves,
            departmentStats,
            attendanceTrend,
            leaveStats,
            payrollSummary
        ] = await Promise.all([
            // 1. Total active employees
            Employee.countDocuments({ status: 'active' }),

            // 2. New employees this month
            Employee.countDocuments({
                status: 'active',
                createdAt: { $gte: firstDayOfMonth }
            }),

            // 3. Today's total attendance
            Attendance.countDocuments({ date: today }),

            // 4. Present today (including late)
            Attendance.countDocuments({
                date: today,
                status: { $in: ['present', 'late'] }
            }),

            // 5. Late today
            Attendance.countDocuments({ date: today, status: 'late' }),

            // 6. Pending leaves
            Leave.countDocuments({ status: 'pending' }),

            // 7. Department distribution (aggregation)
            Employee.aggregate([
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
            ]),

            // 8. Attendance trend (last 7 days) — SINGLE aggregation replaces 7 separate queries
            Attendance.aggregate([
                {
                    $match: {
                        date: { $gte: sevenDaysAgo },
                        status: { $in: ['present', 'late'] }
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                        present: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } },
                {
                    $project: {
                        _id: 0,
                        date: '$_id',
                        present: 1
                    }
                }
            ]),

            // 9. Leave statistics (this year)
            Leave.aggregate([
                {
                    $match: {
                        startDate: { $gte: firstDayOfYear }
                    }
                },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),

            // 10. Payroll summary (current month)
            Payroll.aggregate([
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
            ])
        ]);

        // Fill in missing dates for attendance trend (ensure all 7 days present)
        const trendMap = new Map(attendanceTrend.map(d => [d.date, d.present]));
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            last7Days.push({
                date: dateStr,
                present: trendMap.get(dateStr) || 0
            });
        }

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
            message: 'Failed to fetch dashboard statistics'
        });
    }
});

// @route   GET /api/dashboard/recent-activities
// @desc    Get recent activities
// @access  Private (Admin, HR)
router.get('/recent-activities', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        // Run all recent activity queries in parallel
        const [recentEmployees, recentLeaves, recentAttendance] = await Promise.all([
            Employee.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select('firstName lastName employeeId createdAt'),

            Leave.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('employee', 'firstName lastName')
                .select('type status startDate endDate createdAt'),

            Attendance.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('employee', 'firstName lastName')
        ]);

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
            message: 'Failed to fetch recent activities'
        });
    }
});

export default router;
