import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Enhanced error logging
        console.error('API Error:', {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.response?.data?.message || error.message,
            data: error.response?.data
        });

        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            // Only redirect if not already on login page
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;

// Auth API
export const authAPI = {
    login: (data) => api.post('/auth/login', data),
    register: (data) => api.post('/auth/register', data),
    getMe: () => api.get('/auth/me'),
    changePassword: (data) => api.put('/auth/password', data)
};

// Employee API
export const employeeAPI = {
    getAll: (params) => api.get('/employees', { params }),
    getById: (id) => api.get(`/employees/${id}`),
    create: (data) => api.post('/employees', data),
    update: (id, data) => api.put(`/employees/${id}`, data),
    delete: (id) => api.delete(`/employees/${id}`),
    uploadAvatar: (id, formData) => api.post(`/employees/${id}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getStats: () => api.get('/employees/stats/overview'),
    generateId: () => api.get('/employees/generate-id'),
    getSupervisors: (level, department) => api.get('/employees/supervisors', { params: { level, department } }),
    uploadJD: (id, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/employees/${id}/upload-jd`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    }
};

// Department API
export const departmentAPI = {
    getAll: () => api.get('/departments'),
    getById: (id) => api.get(`/departments/${id}`),
    create: (data) => api.post('/departments', data),
    update: (id, data) => api.put(`/departments/${id}`, data),
    delete: (id) => api.delete(`/departments/${id}`)
};

// Attendance API
export const attendanceAPI = {
    checkIn: (data) => api.post('/attendance/check-in', data),
    checkOut: (data) => api.post('/attendance/check-out', data),
    getToday: () => api.get('/attendance/today'),
    getMy: (params) => api.get('/attendance/my', { params }),
    getReport: (params) => api.get('/attendance/report', { params })
};

// Leave API
export const leaveAPI = {
    getAll: (params) => api.get('/leaves', { params }),
    getMy: () => api.get('/leaves/my'),
    getBalance: () => api.get('/leaves/balance'),
    create: (data) => api.post('/leaves', data),
    approve: (id) => api.put(`/leaves/${id}/approve`),
    reject: (id, reason) => api.put(`/leaves/${id}/reject`, { reason }),
    cancel: (id) => api.delete(`/leaves/${id}`)
};

// Payroll API
export const payrollAPI = {
    getAll: (params) => api.get('/payroll', { params }),
    getMy: () => api.get('/payroll/my'),
    getById: (id) => api.get(`/payroll/${id}`),
    generate: (data) => api.post('/payroll/generate', data),
    update: (id, data) => api.put(`/payroll/${id}`, data),
    approve: (id) => api.put(`/payroll/${id}/approve`),
    markPaid: (id) => api.put(`/payroll/${id}/pay`)
};

// Dashboard API
export const dashboardAPI = {
    getStats: () => api.get('/dashboard/stats'),
    getRecentActivities: () => api.get('/dashboard/recent-activities')
};

// User API (SuperAdmin only)
export const userAPI = {
    getAll: (params) => api.get('/users', { params }),
    getById: (id) => api.get(`/users/${id}`),
    create: (data) => api.post('/users', data),
    update: (id, data) => api.put(`/users/${id}`, data),
    linkEmployee: (id, employeeId) => api.put(`/users/${id}/link-employee`, { employeeId }),
    unlinkEmployee: (id) => api.put(`/users/${id}/link-employee`, { employeeId: null }),
    delete: (id) => api.delete(`/users/${id}`),
    getUnlinkedEmployees: () => api.get('/users/employees/unlinked')
};
