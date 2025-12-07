import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    FiUsers, FiUserCheck, FiUserX, FiClock, FiCalendar,
    FiDollarSign, FiTrendingUp, FiTrendingDown, FiActivity
} from 'react-icons/fi';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { dashboardAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './Dashboard.css';

const Dashboard = () => {
    const { user, isHR } = useAuth();
    const [stats, setStats] = useState(null);
    const [activities, setActivities] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [statsRes, activitiesRes] = await Promise.all([
                dashboardAPI.getStats(),
                dashboardAPI.getRecentActivities()
            ]);
            setStats(statsRes.data.data);
            setActivities(activitiesRes.data.data);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="loading-spinner"></div>
                <p>Loading dashboard...</p>
            </div>
        );
    }

    return (
        <motion.div
            className="dashboard"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Welcome back, {user?.email?.split('@')[0]}!</p>
                </div>
                <div className="header-actions">
                    <span className="current-date">
                        {new Date().toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })}
                    </span>
                </div>
            </div>

            {/* Stats Cards */}
            <motion.div className="stats-grid" variants={itemVariants}>
                <div className="stat-card">
                    <div className="stat-icon primary">
                        <FiUsers />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{stats?.employees?.total || 0}</div>
                        <div className="stat-label">Total Employees</div>
                        {stats?.employees?.newThisMonth > 0 && (
                            <div className="stat-change positive">
                                <FiTrendingUp />
                                +{stats.employees.newThisMonth} this month
                            </div>
                        )}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon success">
                        <FiUserCheck />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{stats?.attendance?.present || 0}</div>
                        <div className="stat-label">Present Today</div>
                        <div className="stat-change positive">
                            {stats?.attendance?.rate || 0}% attendance rate
                        </div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon warning">
                        <FiCalendar />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{stats?.leaves?.pending || 0}</div>
                        <div className="stat-label">Pending Leaves</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon danger">
                        <FiUserX />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{stats?.attendance?.absent || 0}</div>
                        <div className="stat-label">Absent Today</div>
                        <div className="stat-change negative">
                            <FiTrendingDown />
                            {stats?.attendance?.late || 0} late arrivals
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Charts Section */}
            <div className="dashboard-grid">
                {/* Attendance Trend */}
                <motion.div className="card chart-card" variants={itemVariants}>
                    <div className="card-header">
                        <h3 className="card-title">Attendance Trend</h3>
                        <span className="badge badge-primary">Last 7 days</span>
                    </div>
                    <div className="card-body chart-container">
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={stats?.attendanceTrend || []}>
                                <defs>
                                    <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis
                                    dataKey="date"
                                    stroke="var(--text-tertiary)"
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis stroke="var(--text-tertiary)" tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px'
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="present"
                                    stroke="#6366f1"
                                    strokeWidth={2}
                                    fill="url(#colorPresent)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Department Distribution */}
                <motion.div className="card chart-card" variants={itemVariants}>
                    <div className="card-header">
                        <h3 className="card-title">Department Distribution</h3>
                    </div>
                    <div className="card-body chart-container">
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={stats?.departments || []}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="count"
                                    nameKey="name"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    labelLine={false}
                                >
                                    {(stats?.departments || []).map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={COLORS[index % COLORS.length]}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Recent Employees */}
                <motion.div className="card" variants={itemVariants}>
                    <div className="card-header">
                        <h3 className="card-title">Recent Employees</h3>
                        <a href="/employees" className="btn btn-ghost btn-sm">View All</a>
                    </div>
                    <div className="card-body">
                        <div className="recent-list">
                            {activities?.employees?.length === 0 ? (
                                <p className="text-secondary text-center">No recent employees</p>
                            ) : (
                                activities?.employees?.map((employee, index) => (
                                    <div key={employee._id || index} className="recent-item">
                                        <div className="avatar">
                                            {employee.firstName?.[0]}{employee.lastName?.[0]}
                                        </div>
                                        <div className="recent-info">
                                            <span className="recent-name">
                                                {employee.firstName} {employee.lastName}
                                            </span>
                                            <span className="recent-meta">
                                                {employee.employeeId} • Added {new Date(employee.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* Recent Leave Requests */}
                <motion.div className="card" variants={itemVariants}>
                    <div className="card-header">
                        <h3 className="card-title">Leave Requests</h3>
                        <a href="/leaves" className="btn btn-ghost btn-sm">View All</a>
                    </div>
                    <div className="card-body">
                        <div className="recent-list">
                            {activities?.leaves?.length === 0 ? (
                                <p className="text-secondary text-center">No recent leave requests</p>
                            ) : (
                                activities?.leaves?.map((leave, index) => (
                                    <div key={leave._id || index} className="recent-item">
                                        <div className={`status-dot ${leave.status}`}></div>
                                        <div className="recent-info">
                                            <span className="recent-name">
                                                {leave.employee?.firstName} {leave.employee?.lastName}
                                            </span>
                                            <span className="recent-meta">
                                                {leave.type} leave • {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <span className={`badge badge-${leave.status === 'pending' ? 'warning' : leave.status === 'approved' ? 'success' : 'danger'}`}>
                                            {leave.status}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default Dashboard;
