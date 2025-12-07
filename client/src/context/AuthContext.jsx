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

    const isAdmin = user?.role === 'admin';
    const isHR = user?.role === 'hr' || isAdmin;
    const isManager = user?.role === 'manager' || isHR;

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            login,
            register,
            logout,
            isAdmin,
            isHR,
            isManager,
            isAuthenticated: !!user
        }}>
            {children}
        </AuthContext.Provider>
    );
};
