import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiBell, FiSearch, FiSun, FiMoon, FiUser } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

const Header = ({ onMenuClick }) => {
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showDropdown, setShowDropdown] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/employees?search=${encodeURIComponent(searchQuery)}`);
        }
    };

    return (
        <header className="header">
            <div className="header-left">
                <button className="menu-btn" onClick={onMenuClick}>
                    <FiMenu />
                </button>

                <form className="search-box" onSubmit={handleSearch}>
                    <FiSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search employees..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </form>
            </div>

            <div className="header-right">
                <button className="header-btn" onClick={toggleTheme} title="Toggle theme">
                    <motion.div
                        key={theme}
                        initial={{ rotate: -90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        {theme === 'light' ? <FiMoon /> : <FiSun />}
                    </motion.div>
                </button>

                <button className="header-btn notification-btn">
                    <FiBell />
                    <span className="notification-badge">3</span>
                </button>

                <div className="profile-menu">
                    <button
                        className="profile-btn"
                        onClick={() => setShowDropdown(!showDropdown)}
                    >
                        <div className="avatar avatar-sm">
                            {user?.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                    </button>

                    <AnimatePresence>
                        {showDropdown && (
                            <motion.div
                                className="dropdown"
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                            >
                                <div className="dropdown-header">
                                    <span className="dropdown-email">{user?.email}</span>
                                    <span className="dropdown-role">{user?.role}</span>
                                </div>
                                <div className="dropdown-divider"></div>
                                <button
                                    className="dropdown-item"
                                    onClick={() => {
                                        setShowDropdown(false);
                                        navigate('/settings');
                                    }}
                                >
                                    <FiUser />
                                    Profile Settings
                                </button>
                                <div className="dropdown-divider"></div>
                                <button
                                    className="dropdown-item danger"
                                    onClick={() => {
                                        setShowDropdown(false);
                                        logout();
                                    }}
                                >
                                    Logout
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </header>
    );
};

export default Header;
