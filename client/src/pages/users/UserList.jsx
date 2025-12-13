import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FiUsers, FiPlus, FiEdit2, FiSearch,
    FiLink, FiCheck, FiX, FiFilter,
    FiUserCheck, FiUserX, FiMinusCircle, FiCopy, FiEye, FiEyeOff
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { userAPI, employeeAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './UserList.css';

const UserList = () => {
    const { canManageUsers } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [showPasswordFor, setShowPasswordFor] = useState(null); // Track which user's password is visible

    // Form state
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        role: 'employee'
    });

    useEffect(() => {
        fetchUsers();
    }, [search, roleFilter, statusFilter, pagination.page]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data } = await userAPI.getAll({
                page: pagination.page,
                limit: 10,
                search,
                role: roleFilter,
                status: statusFilter
            });
            setUsers(data.data);
            setPagination(data.pagination);
        } catch (error) {
            toast.error('Failed to fetch users');
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const { data } = await employeeAPI.getAll({ limit: 100 });
            setEmployees(data.data);
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await userAPI.create(formData);
            toast.success('User created successfully');
            setShowCreateModal(false);
            setFormData({ email: '', password: '', role: 'employee' });
            fetchUsers();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create user');
        }
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        try {
            await userAPI.update(selectedUser._id, {
                email: formData.email,
                role: formData.role,
                isActive: formData.isActive
            });
            toast.success('User updated successfully');
            setShowEditModal(false);
            setSelectedUser(null);
            fetchUsers();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update user');
        }
    };

    const handleLinkEmployee = async (employeeId) => {
        try {
            await userAPI.linkEmployee(selectedUser._id, employeeId);
            toast.success('User linked to employee successfully');
            setShowLinkModal(false);
            setSelectedUser(null);
            fetchUsers();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to link employee');
        }
    };

    const handleUnlinkEmployee = async (userId) => {
        try {
            await userAPI.unlinkEmployee(userId);
            toast.success('Employee unlinked successfully');
            fetchUsers();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to unlink employee');
        }
    };

    const handleToggleStatus = async (user) => {
        try {
            await userAPI.update(user._id, { isActive: !user.isActive });
            toast.success(`User ${user.isActive ? 'deactivated' : 'activated'} successfully`);
            fetchUsers();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update user status');
        }
    };

    const openEditModal = (user) => {
        setSelectedUser(user);
        setFormData({
            email: user.email,
            role: user.role,
            isActive: user.isActive
        });
        setShowEditModal(true);
    };

    const openLinkModal = (user) => {
        setSelectedUser(user);
        fetchEmployees();
        setShowLinkModal(true);
    };

    const getRoleBadgeClass = (role) => {
        switch (role) {
            case 'superadmin': return 'badge-purple';
            case 'admin': return 'badge-primary';
            case 'hr': return 'badge-success';
            default: return 'badge-secondary';
        }
    };

    const formatDate = (date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const copyToClipboard = (text, label = 'Password') => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success(`${label} copied to clipboard!`);
        }).catch(() => {
            toast.error('Failed to copy');
        });
    };

    if (!canManageUsers) {
        return (
            <div className="access-denied">
                <FiUserX size={48} />
                <h2>Access Denied</h2>
                <p>You don't have permission to access this page.</p>
            </div>
        );
    }

    return (
        <motion.div
            className="users-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            <div className="page-header">
                <div>
                    <h1 className="page-title">User Management</h1>
                    <p className="page-subtitle">Manage user accounts and roles</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowCreateModal(true)}
                >
                    <FiPlus /> Add User
                </button>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-box">
                    <FiSearch />
                    <input
                        type="text"
                        placeholder="Search by email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="filter-group">
                    <FiFilter />
                    <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="">All Roles</option>
                        <option value="superadmin">SuperAdmin</option>
                        <option value="admin">Admin</option>
                        <option value="hr">HR</option>
                        <option value="employee">Employee</option>
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>

            {/* Users Table */}
            <div className="card">
                <div className="table-container">
                    {loading ? (
                        <div className="loading-state">
                            <div className="loading-spinner"></div>
                            <p>Loading users...</p>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="empty-state">
                            <FiUsers size={48} />
                            <h3>No users found</h3>
                            <p>Try adjusting your filters or create a new user.</p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Initial Password</th>
                                    <th>Linked Employee</th>
                                    <th>Status</th>
                                    <th>Last Login</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <motion.tr
                                        key={user._id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <td>
                                            <div className="user-email">
                                                <div className="avatar avatar-sm">
                                                    {user.email[0].toUpperCase()}
                                                </div>
                                                {user.email}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td>
                                            {user.tempPassword ? (
                                                <div className="password-cell">
                                                    <code className="password-display">
                                                        {showPasswordFor === user._id ? user.tempPassword : '••••••••••'}
                                                    </code>
                                                    <button
                                                        className="btn-icon btn-sm"
                                                        onClick={() => setShowPasswordFor(showPasswordFor === user._id ? null : user._id)}
                                                        title={showPasswordFor === user._id ? 'Hide password' : 'Show password'}
                                                    >
                                                        {showPasswordFor === user._id ? <FiEyeOff /> : <FiEye />}
                                                    </button>
                                                    <button
                                                        className="btn-icon btn-sm"
                                                        onClick={() => copyToClipboard(user.tempPassword)}
                                                        title="Copy password"
                                                    >
                                                        <FiCopy />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-muted">—</span>
                                            )}
                                        </td>
                                        <td>
                                            {user.employee ? (
                                                <div className="linked-employee">
                                                    <span>{user.employee.firstName} {user.employee.lastName}</span>
                                                    <button
                                                        className="btn-icon btn-sm"
                                                        onClick={() => handleUnlinkEmployee(user._id)}
                                                        title="Unlink employee"
                                                    >
                                                        <FiMinusCircle />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    onClick={() => openLinkModal(user)}
                                                >
                                                    <FiLink /> Link Employee
                                                </button>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                                {user.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>{formatDate(user.lastLogin)}</td>
                                        <td>
                                            <div className="action-buttons">
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => openEditModal(user)}
                                                    title="Edit user"
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    className={`btn-icon ${user.isActive ? 'btn-danger' : 'btn-success'}`}
                                                    onClick={() => handleToggleStatus(user)}
                                                    title={user.isActive ? 'Deactivate' : 'Activate'}
                                                >
                                                    {user.isActive ? <FiUserX /> : <FiUserCheck />}
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                    <div className="pagination">
                        <button
                            className="btn btn-sm"
                            disabled={pagination.page === 1}
                            onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                        >
                            Previous
                        </button>
                        <span>Page {pagination.page} of {pagination.pages}</span>
                        <button
                            className="btn btn-sm"
                            disabled={pagination.page === pagination.pages}
                            onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* Create User Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowCreateModal(false)}
                    >
                        <motion.div
                            className="modal"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <h3>Create New User</h3>
                                <button className="btn-icon" onClick={() => setShowCreateModal(false)}>
                                    <FiX />
                                </button>
                            </div>
                            <form onSubmit={handleCreate}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Password</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            required
                                            minLength={6}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Role</label>
                                        <select
                                            className="form-input"
                                            value={formData.role}
                                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        >
                                            <option value="employee">Employee</option>
                                            <option value="hr">HR</option>
                                            <option value="admin">Admin</option>
                                            <option value="superadmin">SuperAdmin</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        <FiPlus /> Create User
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit User Modal */}
            <AnimatePresence>
                {showEditModal && selectedUser && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowEditModal(false)}
                    >
                        <motion.div
                            className="modal"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <h3>Edit User</h3>
                                <button className="btn-icon" onClick={() => setShowEditModal(false)}>
                                    <FiX />
                                </button>
                            </div>
                            <form onSubmit={handleEdit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Role</label>
                                        <select
                                            className="form-input"
                                            value={formData.role}
                                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        >
                                            <option value="employee">Employee</option>
                                            <option value="hr">HR</option>
                                            <option value="admin">Admin</option>
                                            <option value="superadmin">SuperAdmin</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select
                                            className="form-input"
                                            value={formData.isActive ? 'active' : 'inactive'}
                                            onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        <FiCheck /> Save Changes
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Link Employee Modal */}
            <AnimatePresence>
                {showLinkModal && selectedUser && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowLinkModal(false)}
                    >
                        <motion.div
                            className="modal"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <h3>Link to Employee</h3>
                                <button className="btn-icon" onClick={() => setShowLinkModal(false)}>
                                    <FiX />
                                </button>
                            </div>
                            <div className="modal-body">
                                <p className="link-info">
                                    Select an employee to link with <strong>{selectedUser.email}</strong>
                                </p>
                                <div className="employee-list">
                                    {employees.length === 0 ? (
                                        <p className="no-employees">No available employees to link</p>
                                    ) : (
                                        employees.map((emp) => (
                                            <div
                                                key={emp._id}
                                                className="employee-item"
                                                onClick={() => handleLinkEmployee(emp._id)}
                                            >
                                                <div className="avatar avatar-sm">
                                                    {emp.firstName[0]}
                                                </div>
                                                <div className="employee-info">
                                                    <span className="employee-name">{emp.firstName} {emp.lastName}</span>
                                                    <span className="employee-id">{emp.employeeId}</span>
                                                </div>
                                                <FiLink />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowLinkModal(false)}>
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default UserList;
