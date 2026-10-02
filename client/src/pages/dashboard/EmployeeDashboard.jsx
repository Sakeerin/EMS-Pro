import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiClock, FiCalendar, FiSun } from 'react-icons/fi';
import { attendanceAPI, leaveAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './Dashboard.css';

const formatTime = (value) => new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const formatDay = (value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const LEAVE_STATUS_BADGE = {
    pending: 'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-danger',
    cancelled: 'badge-info'
};

const fetchMyDashboard = async () => {
    const now = new Date();
    // Local midnight on the 1st, sent as a full timestamp: the server does
    // new Date(startDate), which would read a bare date as UTC and could drop day 1
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [today, month, balance, leaves] = await Promise.all([
        attendanceAPI.getToday(),
        attendanceAPI.getMy({ startDate: monthStart.toISOString(), endDate: now.toISOString() }),
        leaveAPI.getBalance(),
        leaveAPI.getMy()
    ]);
    const records = month.data.data || [];
    return {
        today: today.data.data,
        daysWorked: records.filter((record) => record.checkIn?.time).length,
        daysLate: records.filter((record) => record.status === 'late').length,
        balance: balance.data.data,
        leaves: (leaves.data.data || []).slice(0, 3)
    };
};

// Personal dashboard for employee-role users: the company-wide stats
// endpoints are restricted to admin roles
const EmployeeDashboard = () => {
    const { user } = useAuth();
    const hasProfile = Boolean(user?.employee);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['myDashboard'],
        queryFn: fetchMyDashboard,
        enabled: hasProfile
    });

    const firstName = user?.employee?.firstName || user?.email?.split('@')[0];
    const today = data?.today;

    const renderContent = () => {
        if (!hasProfile) {
            return (
                <div className="card">
                    <div className="card-body">
                        <p className="text-secondary">
                            Your account isn&apos;t linked to an employee profile yet, so there&apos;s no attendance
                            or leave to show. Ask HR to link it.
                        </p>
                    </div>
                </div>
            );
        }
        if (isLoading) {
            return (
                <div className="dashboard-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading dashboard...</p>
                </div>
            );
        }
        if (isError) {
            return (
                <div className="card">
                    <div className="card-body">
                        <p className="text-secondary">Couldn&apos;t load your dashboard. Please try again later.</p>
                    </div>
                </div>
            );
        }

        return (
            <>
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon primary">
                            <FiClock />
                        </div>
                        <div className="stat-content">
                            <div className="stat-value">
                                {today?.checkIn?.time ? formatTime(today.checkIn.time) : 'Not yet'}
                            </div>
                            <div className="stat-label">Checked in today</div>
                            <div className="stat-change">
                                {today?.checkOut?.time
                                    ? `Checked out at ${formatTime(today.checkOut.time)}`
                                    : today?.checkIn?.time
                                        ? 'Not checked out yet'
                                        : <Link to="/attendance">Go to Attendance</Link>}
                            </div>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-icon success">
                            <FiCalendar />
                        </div>
                        <div className="stat-content">
                            <div className="stat-value">{data.daysWorked}</div>
                            <div className="stat-label">Days worked this month</div>
                            <div className={`stat-change ${data.daysLate > 0 ? 'negative' : ''}`}>
                                {data.daysLate} late
                            </div>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-icon warning">
                            <FiSun />
                        </div>
                        <div className="stat-content">
                            <div className="stat-value">{data.balance?.annual?.remaining ?? 0}</div>
                            <div className="stat-label">Annual leave days left</div>
                            <div className="stat-change">
                                Sick {data.balance?.sick?.remaining ?? 0} · Personal {data.balance?.personal?.remaining ?? 0}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">My Leave Requests</h3>
                        <Link to="/leaves" className="btn btn-ghost btn-sm">View All</Link>
                    </div>
                    <div className="card-body">
                        <div className="recent-list">
                            {data.leaves.length === 0 ? (
                                <p className="text-secondary text-center">
                                    No leave requests yet. <Link to="/leaves">Request leave</Link>
                                </p>
                            ) : (
                                data.leaves.map((leave) => (
                                    <div key={leave._id} className="recent-item">
                                        <div className="recent-info">
                                            <span className="recent-name" style={{ textTransform: 'capitalize' }}>
                                                {leave.type} leave
                                            </span>
                                            <span className="recent-meta">
                                                {formatDay(leave.startDate)} – {formatDay(leave.endDate)} • {leave.days} day{leave.days === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                        <span className={`badge ${LEAVE_STATUS_BADGE[leave.status] || 'badge-info'}`}>
                                            {leave.status}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </>
        );
    };

    return (
        <motion.div className="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Welcome back, {firstName}!</p>
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
            {renderContent()}
        </motion.div>
    );
};

export default EmployeeDashboard;
