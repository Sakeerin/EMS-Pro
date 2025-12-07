import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Layout
import Layout from './components/layout/Layout';

// Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/dashboard/Dashboard';
import EmployeeList from './pages/employees/EmployeeList';
import EmployeeForm from './pages/employees/EmployeeForm';
import EmployeeDetail from './pages/employees/EmployeeDetail';
import DepartmentList from './pages/departments/DepartmentList';
import AttendancePage from './pages/attendance/AttendancePage';
import LeavePage from './pages/leaves/LeavePage';
import PayrollPage from './pages/payroll/PayrollPage';
import Settings from './pages/settings/Settings';

// Protected Route Component
const ProtectedRoute = ({ children, roles }) => {
    const { user, loading, isAuthenticated } = useAuth();

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (roles && !roles.includes(user.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

function App() {
    const { loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    return (
        <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes */}
            <Route path="/" element={
                <ProtectedRoute>
                    <Layout />
                </ProtectedRoute>
            }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />

                {/* Employee Routes */}
                <Route path="employees" element={<EmployeeList />} />
                <Route path="employees/new" element={
                    <ProtectedRoute roles={['admin', 'hr']}>
                        <EmployeeForm />
                    </ProtectedRoute>
                } />
                <Route path="employees/:id" element={<EmployeeDetail />} />
                <Route path="employees/:id/edit" element={
                    <ProtectedRoute roles={['admin', 'hr']}>
                        <EmployeeForm />
                    </ProtectedRoute>
                } />

                {/* Department Routes */}
                <Route path="departments" element={
                    <ProtectedRoute roles={['admin', 'hr', 'manager']}>
                        <DepartmentList />
                    </ProtectedRoute>
                } />

                {/* Attendance */}
                <Route path="attendance" element={<AttendancePage />} />

                {/* Leave */}
                <Route path="leaves" element={<LeavePage />} />

                {/* Payroll */}
                <Route path="payroll" element={<PayrollPage />} />

                {/* Settings */}
                <Route path="settings" element={<Settings />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}

export default App;
