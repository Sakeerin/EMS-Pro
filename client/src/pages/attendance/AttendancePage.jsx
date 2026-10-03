import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiClock, FiLogIn, FiLogOut, FiCalendar, FiCheck, FiX } from 'react-icons/fi';
import { attendanceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './Attendance.css';

const OVERTIME_BADGES = { pending: 'warning', approved: 'success', rejected: 'danger' };

const AttendancePage = () => {
    const { isHR, user } = useAuth();
    // Accounts without an employee profile (e.g. a bootstrap superadmin) can't check in
    const hasProfile = Boolean(user?.employee);
    const [todayStatus, setTodayStatus] = useState(null);
    const [myAttendance, setMyAttendance] = useState([]);
    const [loading, setLoading] = useState(hasProfile);
    const [actionLoading, setActionLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [pendingOvertime, setPendingOvertime] = useState([]);
    const [overtimeLoading, setOvertimeLoading] = useState(isHR);

    useEffect(() => {
        if (hasProfile) fetchData();
        if (isHR) fetchOvertime();
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchOvertime = async () => {
        try {
            const { data } = await attendanceAPI.getOvertime({ status: 'pending' });
            setPendingOvertime(data.data || []);
        } catch (error) {
            console.error('Failed to fetch overtime:', error);
            toast.error('Failed to load overtime');
        } finally {
            setOvertimeLoading(false);
        }
    };

    const handleOvertime = async (id, decision) => {
        try {
            await attendanceAPI.reviewOvertime(id, decision);
            toast.success(decision === 'approve' ? 'Overtime approved' : 'Overtime rejected');
            fetchOvertime();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update overtime');
        }
    };

    const fetchData = async () => {
        try {
            const [todayRes, myRes] = await Promise.all([
                attendanceAPI.getToday(),
                attendanceAPI.getMy()
            ]);
            setTodayStatus(todayRes.data.data);
            setMyAttendance(myRes.data.data);
        } catch (error) {
            console.error('Failed to fetch attendance:', error);

            // Enhanced error handling with detailed messages
            const status = error.response?.status;
            const message = error.response?.data?.message || error.message;

            if (status === 401) {
                toast.error('Session expired. Please log in again.');
            } else if (status === 404) {
                toast.error(`API endpoint not found (404): ${error.config?.url}`);
                console.error('Request URL:', error.config?.baseURL + error.config?.url);
            } else if (status === 500) {
                toast.error(`Server error: ${message}`);
            } else if (error.code === 'ERR_NETWORK') {
                toast.error('Network error. Is the backend server running on port 5000?');
            } else {
                toast.error(`Failed to load attendance: ${message} (${status || 'Unknown'})`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCheckIn = async () => {
        setActionLoading(true);
        try {
            await attendanceAPI.checkIn({});
            toast.success('Checked in successfully!');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Check-in failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCheckOut = async () => {
        setActionLoading(true);
        try {
            await attendanceAPI.checkOut({});
            toast.success('Checked out successfully!');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Check-out failed');
        } finally {
            setActionLoading(false);
        }
    };

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const isCheckedIn = todayStatus?.checkIn?.time;
    const isCheckedOut = todayStatus?.checkOut?.time;

    const renderOvertime = (record) => record.overtime > 0 ? (
        <span className="overtime-cell">
            {record.overtime.toFixed(1)} hrs
            {OVERTIME_BADGES[record.overtimeStatus] && (
                <span className={`badge badge-${OVERTIME_BADGES[record.overtimeStatus]}`}>{record.overtimeStatus}</span>
            )}
        </span>
    ) : '-';

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Attendance</h1>
                    <p className="page-subtitle">{!hasProfile && isHR ? 'Review overtime' : 'Track your work hours'}</p>
                </div>
            </div>

            {!hasProfile && (
                <div className="card attendance-card">
                    <div className="card-body">
                        <p className="text-secondary">
                            Your account isn&apos;t linked to an employee profile yet, so you can&apos;t check in
                            or see attendance history. Ask HR to link it.
                        </p>
                    </div>
                </div>
            )}

            {/* Overtime waiting for a decision: unpaid until approved */}
            {isHR && (
                <div className="card attendance-card">
                    <div className="card-header">
                        <h3 className="card-title">Overtime Approvals</h3>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Date</th>
                                    <th>Check In</th>
                                    <th>Check Out</th>
                                    <th>Working Hours</th>
                                    <th>Overtime</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {overtimeLoading ? (
                                    <tr>
                                        <td colSpan="7">
                                            <div className="skeleton" style={{ height: 40 }}></div>
                                        </td>
                                    </tr>
                                ) : pendingOvertime.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="text-center text-secondary" style={{ padding: 24 }}>
                                            No overtime waiting for approval
                                        </td>
                                    </tr>
                                ) : (
                                    pendingOvertime.map((record) => (
                                        <tr key={record._id}>
                                            <td>{record.employee?.firstName} {record.employee?.lastName}</td>
                                            <td>{new Date(record.date).toLocaleDateString()}</td>
                                            <td>{record.checkIn?.time ? formatTime(record.checkIn.time) : '-'}</td>
                                            <td>{record.checkOut?.time ? formatTime(record.checkOut.time) : '-'}</td>
                                            <td>{record.workingHours?.toFixed(1)} hrs</td>
                                            <td>{record.overtime?.toFixed(1)} hrs</td>
                                            <td>
                                                {/* No approving your own overtime (the server refuses it too) */}
                                                {record.employee?._id === user?.employee?._id ? (
                                                    <span className="text-secondary">Needs another approver</span>
                                                ) : (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleOvertime(record._id, 'approve')}
                                                            className="btn btn-success btn-sm btn-icon"
                                                            title="Approve overtime"
                                                        >
                                                            <FiCheck />
                                                        </button>
                                                        <button
                                                            onClick={() => handleOvertime(record._id, 'reject')}
                                                            className="btn btn-danger btn-sm btn-icon"
                                                            title="Reject overtime"
                                                        >
                                                            <FiX />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {hasProfile && (
                <>
                    {/* Clock Widget */}
                    <div className="attendance-clock-section">
                        <motion.div
                            className="clock-widget"
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                        >
                            <div className="clock-display">
                                <span className="clock-time">
                                    {currentTime.toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true
                                    })}
                                </span>
                                <span className="clock-date">
                                    {currentTime.toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </span>
                            </div>

                            <div className="clock-status">
                                {isCheckedIn && (
                                    <div className="status-item checked-in">
                                        <FiLogIn />
                                        <div>
                                            <span className="status-label">Checked In</span>
                                            <span className="status-time">{formatTime(todayStatus.checkIn.time)}</span>
                                        </div>
                                    </div>
                                )}
                                {isCheckedOut && (
                                    <div className="status-item checked-out">
                                        <FiLogOut />
                                        <div>
                                            <span className="status-label">Checked Out</span>
                                            <span className="status-time">{formatTime(todayStatus.checkOut.time)}</span>
                                        </div>
                                    </div>
                                )}
                                {isCheckedIn && isCheckedOut && (
                                    <div className="status-item working-hours">
                                        <FiClock />
                                        <div>
                                            <span className="status-label">Working Hours</span>
                                            <span className="status-time">{todayStatus.workingHours?.toFixed(1)} hrs</span>
                                        </div>
                                    </div>
                                )}
                                {isCheckedOut && todayStatus.overtime > 0 && (
                                    <div className="status-item working-hours">
                                        <FiClock />
                                        <div>
                                            <span className="status-label">Overtime</span>
                                            <span className="status-time">{renderOvertime(todayStatus)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="clock-actions">
                                {!isCheckedIn ? (
                                    <motion.button
                                        className="btn btn-success btn-lg"
                                        onClick={handleCheckIn}
                                        disabled={actionLoading}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <FiLogIn />
                                        {actionLoading ? 'Checking In...' : 'Check In'}
                                    </motion.button>
                                ) : !isCheckedOut ? (
                                    <motion.button
                                        className="btn btn-danger btn-lg"
                                        onClick={handleCheckOut}
                                        disabled={actionLoading}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <FiLogOut />
                                        {actionLoading ? 'Checking Out...' : 'Check Out'}
                                    </motion.button>
                                ) : (
                                    <div className="completed-message">
                                        <span className="badge badge-success">✓ Attendance completed for today</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>

                    {/* Attendance History */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Attendance History</h3>
                        </div>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Check In</th>
                                        <th>Check Out</th>
                                        <th>Working Hours</th>
                                        <th>Overtime</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i}>
                                                <td colSpan="6">
                                                    <div className="skeleton" style={{ height: 40 }}></div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : myAttendance.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="text-center text-secondary" style={{ padding: 40 }}>
                                                No attendance records yet
                                            </td>
                                        </tr>
                                    ) : (
                                        myAttendance.map((record) => (
                                            <tr key={record._id}>
                                                <td>{new Date(record.date).toLocaleDateString()}</td>
                                                <td>{record.checkIn?.time ? formatTime(record.checkIn.time) : '-'}</td>
                                                <td>{record.checkOut?.time ? formatTime(record.checkOut.time) : '-'}</td>
                                                <td>{record.workingHours ? `${record.workingHours.toFixed(1)} hrs` : '-'}</td>
                                                <td>{renderOvertime(record)}</td>
                                                <td>
                                                    <span className={`badge badge-${record.status === 'present' ? 'success' : record.status === 'late' ? 'warning' : 'danger'}`}>
                                                        {record.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </motion.div>
    );
};

export default AttendancePage;
