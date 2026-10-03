import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiCheck, FiX, FiCalendar, FiClock } from 'react-icons/fi';
import { leaveAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './Leave.css';

const LeavePage = () => {
    const { canApproveLeaves, user } = useAuth();
    // Accounts without an employee profile (e.g. a bootstrap superadmin) have no
    // leave of their own: no balance, no "My Leaves", no requests
    const hasProfile = Boolean(user?.employee);
    const [leaves, setLeaves] = useState([]);
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState(hasProfile || !canApproveLeaves ? 'my' : 'all');
    const latestRequest = useRef(0);
    const [formData, setFormData] = useState({
        type: 'annual',
        startDate: '',
        endDate: '',
        reason: ''
    });

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        // Switching tabs quickly can return responses out of order; only the
        // latest request may update the page
        const requestId = ++latestRequest.current;
        const isLatest = () => requestId === latestRequest.current;
        setLoading(true);

        // Loaded separately so a failed balance doesn't hide the list (and vice versa)
        const loadLeaves = async () => {
            if (activeTab === 'my' && !hasProfile) return [];
            const res = activeTab === 'my' ? await leaveAPI.getMy() : await leaveAPI.getAll();
            return res.data.data || [];
        };
        const loadBalance = async () => {
            if (!hasProfile) return null;
            const res = await leaveAPI.getBalance();
            return res.data.data;
        };

        const [leavesResult, balanceResult] = await Promise.allSettled([loadLeaves(), loadBalance()]);
        if (!isLatest()) return;

        if (leavesResult.status === 'fulfilled') {
            setLeaves(leavesResult.value);
        } else {
            console.error('Failed to fetch leaves:', leavesResult.reason);
            setLeaves([]);
            toast.error('Failed to load leave requests');
        }
        if (balanceResult.status === 'fulfilled') {
            setBalance(balanceResult.value);
        } else {
            console.error('Failed to fetch leave balance:', balanceResult.reason);
            setBalance(null);
        }
        setLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await leaveAPI.create(formData);
            toast.success('Leave request submitted');
            setShowModal(false);
            setFormData({ type: 'annual', startDate: '', endDate: '', reason: '' });
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit leave request');
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprove = async (id) => {
        try {
            await leaveAPI.approve(id);
            toast.success('Leave approved');
            fetchData();
        } catch (error) {
            toast.error('Failed to approve leave');
        }
    };

    const handleReject = async (id) => {
        const reason = prompt('Please provide a reason for rejection:');
        if (!reason) return;
        try {
            await leaveAPI.reject(id, reason);
            toast.success('Leave rejected');
            fetchData();
        } catch (error) {
            toast.error('Failed to reject leave');
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Leave Management</h1>
                    <p className="page-subtitle">{!hasProfile && canApproveLeaves ? 'Review leave requests' : 'Manage your time off'}</p>
                </div>
                {hasProfile && (
                    <button onClick={() => setShowModal(true)} className="btn btn-primary">
                        <FiPlus /> Request Leave
                    </button>
                )}
            </div>

            {/* Leave Balance Cards */}
            {balance && (
                <div className="leave-balance-grid">
                    <div className="leave-balance-card annual">
                        <h4>Annual Leave</h4>
                        <div className="balance-numbers">
                            <span className="remaining">{balance.annual?.remaining || 0}</span>
                            <span className="total">/ {balance.annual?.total || 0}</span>
                        </div>
                        <div className="balance-bar">
                            <div
                                className="balance-progress"
                                style={{ width: `${((balance.annual?.remaining || 0) / (balance.annual?.total || 1)) * 100}%` }}
                            />
                        </div>
                    </div>

                    <div className="leave-balance-card sick">
                        <h4>Sick Leave</h4>
                        <div className="balance-numbers">
                            <span className="remaining">{balance.sick?.remaining || 0}</span>
                            <span className="total">/ {balance.sick?.total || 0}</span>
                        </div>
                        <div className="balance-bar">
                            <div
                                className="balance-progress"
                                style={{ width: `${((balance.sick?.remaining || 0) / (balance.sick?.total || 1)) * 100}%` }}
                            />
                        </div>
                    </div>

                    <div className="leave-balance-card personal">
                        <h4>Personal Leave</h4>
                        <div className="balance-numbers">
                            <span className="remaining">{balance.personal?.remaining || 0}</span>
                            <span className="total">/ {balance.personal?.total || 0}</span>
                        </div>
                        <div className="balance-bar">
                            <div
                                className="balance-progress"
                                style={{ width: `${((balance.personal?.remaining || 0) / (balance.personal?.total || 1)) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs (without a profile there's only "All Requests") */}
            {canApproveLeaves && hasProfile && (
                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'my' ? 'active' : ''}`}
                        onClick={() => setActiveTab('my')}
                    >
                        My Leaves
                    </button>
                    <button
                        className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveTab('all')}
                    >
                        All Requests
                    </button>
                </div>
            )}

            {/* Leave List */}
            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                {activeTab === 'all' && <th>Employee</th>}
                                <th>Type</th>
                                <th>Period</th>
                                <th>Days</th>
                                <th>Reason</th>
                                <th>Status</th>
                                {activeTab === 'all' && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan={activeTab === 'all' ? 7 : 5}>
                                            <div className="skeleton" style={{ height: 40 }}></div>
                                        </td>
                                    </tr>
                                ))
                            ) : leaves.length === 0 ? (
                                <tr>
                                    <td colSpan={activeTab === 'all' ? 7 : 5} className="text-center text-secondary" style={{ padding: 40 }}>
                                        {activeTab === 'my' && !hasProfile
                                            ? "Your account isn't linked to an employee profile yet, so you can't request leave. Ask HR to link it."
                                            : 'No leave requests found'}
                                    </td>
                                </tr>
                            ) : (
                                leaves.map((leave) => (
                                    <tr key={leave._id}>
                                        {activeTab === 'all' && (
                                            <td>{leave.employee?.firstName} {leave.employee?.lastName}</td>
                                        )}
                                        <td>
                                            <span className="badge badge-primary" style={{ textTransform: 'capitalize' }}>
                                                {leave.type}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <FiCalendar />
                                                {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td>{leave.days}</td>
                                        <td className="truncate" style={{ maxWidth: 200 }}>{leave.reason}</td>
                                        <td>
                                            <span className={`badge badge-${leave.status === 'pending' ? 'warning' : leave.status === 'approved' ? 'success' : 'danger'}`}>
                                                {leave.status}
                                            </span>
                                        </td>
                                        {activeTab === 'all' && (
                                            <td>
                                                {/* No approving or rejecting your own request (the server refuses it too) */}
                                                {leave.status === 'pending' && leave.employee?._id !== user?.employee?._id && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleApprove(leave._id)}
                                                            className="btn btn-success btn-sm btn-icon"
                                                            title="Approve"
                                                        >
                                                            <FiCheck />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(leave._id)}
                                                            className="btn btn-danger btn-sm btn-icon"
                                                            title="Reject"
                                                        >
                                                            <FiX />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <motion.div
                        className="modal"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <div className="modal-header">
                            <h3 className="modal-title">Request Leave</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Leave Type</label>
                                    <select
                                        className="form-input form-select"
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        <option value="annual">Annual Leave</option>
                                        <option value="sick">Sick Leave</option>
                                        <option value="personal">Personal Leave</option>
                                        <option value="unpaid">Unpaid Leave</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Start Date</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.startDate}
                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">End Date</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Reason</label>
                                    <textarea
                                        className="form-input"
                                        rows="3"
                                        value={formData.reason}
                                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
};

export default LeavePage;
