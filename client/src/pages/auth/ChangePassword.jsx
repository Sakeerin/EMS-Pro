import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiKey, FiLock, FiLogOut } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './Auth.css';

// Same rule the server enforces: 8+ characters with upper, lower and a number
const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const fields = [
    { name: 'currentPassword', label: 'Temporary Password', placeholder: 'Enter the temporary password', autoComplete: 'current-password' },
    { name: 'newPassword', label: 'New Password', placeholder: 'At least 8 characters', autoComplete: 'new-password' },
    { name: 'confirmPassword', label: 'Confirm New Password', placeholder: 'Re-enter the new password', autoComplete: 'new-password' }
];

const ChangePassword = () => {
    const navigate = useNavigate();
    const { user, logout, markPasswordChanged } = useAuth();
    const [formData, setFormData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [showPasswords, setShowPasswords] = useState(false);
    const [loading, setLoading] = useState(false);

    // Only accounts on a temporary password belong here
    if (!user?.mustChangePassword) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        const { currentPassword, newPassword, confirmPassword } = formData;

        if (!passwordRule.test(newPassword)) {
            toast.error('Password must be at least 8 characters with an uppercase letter, a lowercase letter and a number');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        if (newPassword === currentPassword) {
            toast.error('New password must be different from the temporary password');
            return;
        }

        setLoading(true);
        try {
            await authAPI.changePassword({ currentPassword, newPassword });
            markPasswordChanged();
            toast.success('Password changed');
            navigate('/dashboard', { replace: true });
        } catch (error) {
            const data = error.response?.data;
            toast.error(data?.errors?.[0]?.message || data?.message || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    return (
        <div className="auth-page">
            <div className="auth-background">
                <div className="gradient-blob blob-1"></div>
                <div className="gradient-blob blob-2"></div>
                <div className="gradient-blob blob-3"></div>
            </div>

            <motion.div
                className="auth-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="auth-header">
                    <div className="auth-logo">
                        <FiKey />
                    </div>
                    <h1>Set a New Password</h1>
                    <p>{user.email} is signed in with a temporary password. Choose a new one to continue.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {fields.map(({ name, label, placeholder, autoComplete }) => (
                        <div className="form-group" key={name}>
                            <label className="form-label" htmlFor={name}>{label}</label>
                            <div className="input-wrapper">
                                <FiLock className="input-icon" />
                                <input
                                    id={name}
                                    type={showPasswords ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder={placeholder}
                                    autoComplete={autoComplete}
                                    value={formData[name]}
                                    onChange={(e) => setFormData({ ...formData, [name]: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                    ))}

                    <label className="checkbox-wrapper">
                        <input
                            type="checkbox"
                            checked={showPasswords}
                            onChange={(e) => setShowPasswords(e.target.checked)}
                        />
                        <span>Show passwords</span>
                    </label>

                    <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={loading}>
                        {loading ? (
                            <div className="loading-spinner" style={{ width: 20, height: 20 }}></div>
                        ) : (
                            'Change Password'
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                        <FiLogOut /> Log out
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default ChangePassword;
