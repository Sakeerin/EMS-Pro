import { useState } from 'react';
import { motion } from 'framer-motion';
import { FiUser, FiLock, FiMoon, FiSun, FiBell, FiGlobe } from 'react-icons/fi';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './Settings.css';

const Settings = () => {
    const { theme, toggleTheme } = useTheme();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('profile');
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);

    const handlePasswordChange = async (e) => {
        e.preventDefault();

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (passwordData.newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            await authAPI.changePassword({
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword
            });
            toast.success('Password changed successfully');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { id: 'profile', label: 'Profile', icon: FiUser },
        { id: 'security', label: 'Security', icon: FiLock },
        { id: 'appearance', label: 'Appearance', icon: FiMoon },
        { id: 'notifications', label: 'Notifications', icon: FiBell },
    ];

    return (
        <motion.div
            className="settings-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            <div className="page-header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Manage your account preferences</p>
                </div>
            </div>

            <div className="settings-layout">
                <div className="settings-sidebar">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <tab.icon />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="settings-content">
                    {/* Profile Tab */}
                    {activeTab === 'profile' && (
                        <motion.div
                            className="card"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <div className="card-header">
                                <h3 className="card-title">Profile Information</h3>
                            </div>
                            <div className="card-body">
                                <div className="profile-section">
                                    <div className="avatar avatar-xl">
                                        {user?.email?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="profile-details">
                                        <h4>{user?.email}</h4>
                                        <span className="badge badge-primary" style={{ textTransform: 'capitalize' }}>
                                            {user?.role}
                                        </span>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Email Address</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        value={user?.email || ''}
                                        disabled
                                    />
                                    <small className="text-secondary">Email cannot be changed</small>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Role</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={user?.role || ''}
                                        disabled
                                        style={{ textTransform: 'capitalize' }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Security Tab */}
                    {activeTab === 'security' && (
                        <motion.div
                            className="card"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <div className="card-header">
                                <h3 className="card-title">Change Password</h3>
                            </div>
                            <div className="card-body">
                                <form onSubmit={handlePasswordChange}>
                                    <div className="form-group">
                                        <label className="form-label">Current Password</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            value={passwordData.currentPassword}
                                            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">New Password</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            value={passwordData.newPassword}
                                            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Confirm New Password</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            value={passwordData.confirmPassword}
                                            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <button type="submit" className="btn btn-primary" disabled={loading}>
                                        {loading ? 'Changing...' : 'Change Password'}
                                    </button>
                                </form>
                            </div>
                        </motion.div>
                    )}

                    {/* Appearance Tab */}
                    {activeTab === 'appearance' && (
                        <motion.div
                            className="card"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <div className="card-header">
                                <h3 className="card-title">Appearance</h3>
                            </div>
                            <div className="card-body">
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>Theme</h4>
                                        <p>Choose between light and dark mode</p>
                                    </div>
                                    <div className="theme-toggle">
                                        <button
                                            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                                            onClick={() => theme !== 'light' && toggleTheme()}
                                        >
                                            <FiSun /> Light
                                        </button>
                                        <button
                                            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                                            onClick={() => theme !== 'dark' && toggleTheme()}
                                        >
                                            <FiMoon /> Dark
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Notifications Tab */}
                    {activeTab === 'notifications' && (
                        <motion.div
                            className="card"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <div className="card-header">
                                <h3 className="card-title">Notification Settings</h3>
                            </div>
                            <div className="card-body">
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>Email Notifications</h4>
                                        <p>Receive email updates about your account</p>
                                    </div>
                                    <label className="toggle-switch">
                                        <input type="checkbox" defaultChecked />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>

                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>Leave Approvals</h4>
                                        <p>Get notified when your leave is approved or rejected</p>
                                    </div>
                                    <label className="toggle-switch">
                                        <input type="checkbox" defaultChecked />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>

                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>Payroll Updates</h4>
                                        <p>Receive notifications about salary payments</p>
                                    </div>
                                    <label className="toggle-switch">
                                        <input type="checkbox" defaultChecked />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default Settings;
