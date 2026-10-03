import { lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import EmployeeDashboard from './EmployeeDashboard';

// The charts library is large and only HR/admin roles see charts, so their
// dashboard downloads separately
const AdminDashboard = lazy(() => import('./AdminDashboard'));

// Admin/HR roles see company-wide numbers; everyone else gets their own dashboard
const Dashboard = () => {
    const { isHR } = useAuth();
    return isHR ? <AdminDashboard /> : <EmployeeDashboard />;
};

export default Dashboard;
