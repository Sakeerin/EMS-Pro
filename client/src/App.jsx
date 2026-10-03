import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Layout
import Layout from './components/layout/Layout';

// Pages. Login is the first screen signed-out visitors see, so it ships in the
// main bundle; every other page is downloaded on its first visit
import Login from './pages/auth/Login';
const ChangePassword = lazy(() => import('./pages/auth/ChangePassword'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const EmployeeList = lazy(() => import('./pages/employees/EmployeeList'));
const EmployeeForm = lazy(() => import('./pages/employees/EmployeeForm'));
const EmployeeDetail = lazy(() => import('./pages/employees/EmployeeDetail'));
const DepartmentList = lazy(() => import('./pages/departments/DepartmentList'));
const AttendancePage = lazy(() => import('./pages/attendance/AttendancePage'));
const LeavePage = lazy(() => import('./pages/leaves/LeavePage'));
const PayrollPage = lazy(() => import('./pages/payroll/PayrollPage'));
const Settings = lazy(() => import('./pages/settings/Settings'));
const UserList = lazy(() => import('./pages/users/UserList'));

const FullPageSpinner = () => (
    <div className="loading-overlay">
        <div className="loading-spinner"></div>
    </div>
);

// Protected Route Component
const ProtectedRoute = ({ children, roles }) => {
    const { user, loading, isAuthenticated } = useAuth();
    const location = useLocation();

    if (loading) {
        return <FullPageSpinner />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Users on a temporary password must change it before anything else
    if (user.mustChangePassword && location.pathname !== '/change-password') {
        return <Navigate to="/change-password" replace />;
    }

    if (roles && !roles.includes(user.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

function App() {
    const { loading } = useAuth();

    if (loading) {
        return <FullPageSpinner />;
    }

    // Pages inside the layout have their own fallback (see Layout), so this one
    // only shows for pages outside it, like /change-password
    return (
        <Suspense fallback={<FullPageSpinner />}>
            <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/change-password" element={
                    <ProtectedRoute>
                        <ChangePassword />
                    </ProtectedRoute>
                } />

                {/* Protected Routes */}
                <Route path="/" element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />

                    {/* User Management - SuperAdmin only */}
                    <Route path="users" element={
                        <ProtectedRoute roles={['superadmin']}>
                            <UserList />
                        </ProtectedRoute>
                    } />

                    {/* Employee Routes */}
                    <Route path="employees" element={
                        <ProtectedRoute roles={['superadmin', 'admin', 'hr']}>
                            <EmployeeList />
                        </ProtectedRoute>
                    } />
                    <Route path="employees/new" element={
                        <ProtectedRoute roles={['superadmin', 'admin', 'hr']}>
                            <EmployeeForm />
                        </ProtectedRoute>
                    } />
                    <Route path="employees/:id" element={<EmployeeDetail />} />
                    <Route path="employees/:id/edit" element={
                        <ProtectedRoute roles={['superadmin', 'admin', 'hr']}>
                            <EmployeeForm />
                        </ProtectedRoute>
                    } />

                    {/* Department Routes */}
                    <Route path="departments" element={
                        <ProtectedRoute roles={['superadmin', 'admin', 'hr']}>
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
        </Suspense>
    );
}

export default App;
