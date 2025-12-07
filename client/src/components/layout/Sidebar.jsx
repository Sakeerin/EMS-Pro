import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FiHome, FiUsers, FiCalendar, FiClock, FiBriefcase,
    FiDollarSign, FiSettings, FiChevronLeft, FiLogOut,
    FiLayers
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

const menuItems = [
    { path: '/dashboard', icon: FiHome, label: 'Dashboard' },
    { path: '/employees', icon: FiUsers, label: 'Employees' },
    { path: '/departments', icon: FiLayers, label: 'Departments', roles: ['admin', 'hr', 'manager'] },
    { path: '/attendance', icon: FiClock, label: 'Attendance' },
    { path: '/leaves', icon: FiCalendar, label: 'Leaves' },
    { path: '/payroll', icon: FiDollarSign, label: 'Payroll' },
    { path: '/settings', icon: FiSettings, label: 'Settings' },
];

const Sidebar = ({ collapsed, onToggle }) => {
    const location = useLocation();
    const { user, logout, isAdmin, isHR, isManager } = useAuth();

    const filteredMenuItems = menuItems.filter(item => {
        if (!item.roles) return true;
        return item.roles.some(role => {
            if (role === 'admin') return isAdmin;
            if (role === 'hr') return isHR;
            if (role === 'manager') return isManager;
            return false;
        });
    });

    return (
        <motion.aside
            className={`sidebar ${collapsed ? 'collapsed' : ''}`}
            initial={false}
            animate={{ width: collapsed ? 80 : 280 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
            <div className="sidebar-header">
                <AnimatePresence mode="wait">
                    {!collapsed && (
                        <motion.div
                            className="logo"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="logo-icon">
                                <FiBriefcase />
                            </div>
                            <span className="logo-text">EMS Pro</span>
                        </motion.div>
                    )}
                </AnimatePresence>
                <button className="toggle-btn" onClick={onToggle}>
                    <motion.div
                        animate={{ rotate: collapsed ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <FiChevronLeft />
                    </motion.div>
                </button>
            </div>

            <nav className="sidebar-nav">
                {filteredMenuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    >
                        <span className="nav-icon">
                            <item.icon />
                        </span>
                        <AnimatePresence mode="wait">
                            {!collapsed && (
                                <motion.span
                                    className="nav-label"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {item.label}
                                </motion.span>
                            )}
                        </AnimatePresence>
                        {location.pathname === item.path && (
                            <motion.div
                                className="nav-indicator"
                                layoutId="activeIndicator"
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                        )}
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="user-info">
                    <div className="avatar">
                        {user?.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <AnimatePresence mode="wait">
                        {!collapsed && (
                            <motion.div
                                className="user-details"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <span className="user-email">{user?.email}</span>
                                <span className="user-role">{user?.role}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <button className="logout-btn" onClick={logout} title="Logout">
                    <FiLogOut />
                    <AnimatePresence mode="wait">
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                Logout
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>
            </div>
        </motion.aside>
    );
};

export default Sidebar;
