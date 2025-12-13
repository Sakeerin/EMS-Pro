import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiCheck, FiX, FiCalendar, FiClock } from 'react-icons/fi';
import { leaveAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './Leave.css';

const LeavePage = () => {
    const { isHR, canApproveLeaves, user } = useAuth();
    const [leaves, setLeaves] = useState([]);
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [activeTab, setActiveTab] = useState('my');
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
        setLoading(true);
        try {
            const [leavesRes, balanceRes] = await Promise.all([
                activeTab === 'my' ? leaveAPI.getMy() : leaveAPI.getAll(),
                leaveAPI.getBalance()
            ]);
            setLeaves(leavesRes.data.data || []);
            setBalance(balanceRes.data.data);
        } catch (error) {
            console.error('Failed to fetch leaves:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await leaveAPI.create(formData);
            toast.success('Leave request submitted');
            setShowModal(false);
            setFormData({ type: 'annual', startDate: '', endDate: '', reason: '' });
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit leave request');
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
                    <p className="page-subtitle">Manage your time off</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn btn-primary">
                    <FiPlus /> Request Leave
                </button>
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

            {/* Tabs */}
            {canApproveLeaves && (
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
                                        No leave requests found
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
                                                {leave.status === 'pending' && (
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
                                <button type="submit" className="btn btn-primary">
                                    Submit Request
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
