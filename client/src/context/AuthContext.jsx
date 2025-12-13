import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                const { data } = await api.get('/auth/me');
                setUser(data.data);
            } catch (error) {
                localStorage.removeItem('token');
                delete api.defaults.headers.common['Authorization'];
            }
        }
        setLoading(false);
    };

    const login = async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        localStorage.setItem('token', data.data.token);
        api.defaults.headers.common['Authorization'] = `Bearer ${data.data.token}`;
        setUser(data.data);
        return data;
    };

    const register = async (userData) => {
        const { data } = await api.post('/auth/register', userData);
        localStorage.setItem('token', data.data.token);
        api.defaults.headers.common['Authorization'] = `Bearer ${data.data.token}`;
        setUser(data.data);
        return data;
    };

    const logout = () => {
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
    };

    const isSuperAdmin = user?.role === 'superadmin';
    const isAdmin = user?.role === 'admin' || isSuperAdmin;
    const isHR = user?.role === 'hr' || isAdmin;
    const isEmployee = user?.role === 'employee';

    // Permission helpers
    const canManageUsers = isSuperAdmin;
    const canDeleteEmployee = isSuperAdmin || user?.role === 'admin';
    const canEditEmployee = isHR;
    const canManageDepartments = isHR;
    const canApproveLeaves = isHR;
    const canManagePayroll = isSuperAdmin || user?.role === 'admin';

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            login,
            register,
            logout,
            isSuperAdmin,
            isAdmin,
            isHR,
            isEmployee,
            canManageUsers,
            canDeleteEmployee,
            canEditEmployee,
            canManageDepartments,
            canApproveLeaves,
            canManagePayroll,
            isAuthenticated: !!user
        }}>
            {children}
        </AuthContext.Provider>
    );
};
