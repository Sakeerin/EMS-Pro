import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiEdit2, FiMail, FiPhone, FiMapPin, FiCalendar } from 'react-icons/fi';
import { employeeAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './Employees.css';

const EmployeeDetail = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEmployee();
    }, [id]);

    const fetchEmployee = async () => {
        try {
            const { data } = await employeeAPI.getById(id);
            setEmployee(data.data);
        } catch (error) {
            toast.error('Failed to fetch employee');
            navigate('/employees');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    if (!employee) {
        return null;
    }

    return (
        <motion.div
            className="employee-detail-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            <div className="page-header">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/employees')} className="btn btn-ghost btn-icon">
                        <FiArrowLeft />
                    </button>
                    <div>
                        <h1 className="page-title">Employee Details</h1>
                    </div>
                </div>
                <Link to={`/employees/${id}/edit`} className="btn btn-primary">
                    <FiEdit2 /> Edit
                </Link>
            </div>

            <div className="card">
                <div className="card-body">
                    {/* Profile Header */}
                    <div className="employee-profile">
                        <div className="profile-avatar">
                            {employee.avatar ? (
                                <img src={employee.avatar} alt="" />
                            ) : (
                                `${employee.firstName?.[0]}${employee.lastName?.[0]}`
                            )}
                        </div>
                        <div className="profile-info">
                            <h2 className="profile-name">{employee.firstName} {employee.lastName}</h2>
                            <p className="profile-position">{employee.position}</p>
                            <div className="profile-meta">
                                <span className="meta-item">
                                    <FiMail /> {employee.email}
                                </span>
                                {employee.phone && (
                                    <span className="meta-item">
                                        <FiPhone /> {employee.phone}
                                    </span>
                                )}
                                <span className={`badge badge-${employee.status === 'active' ? 'success' : 'warning'}`}>
                                    {employee.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className="info-grid">
                        <div className="info-card">
                            <h4 className="info-card-title">Work Information</h4>
                            <div className="info-row">
                                <span className="info-label">Employee ID</span>
                                <span className="info-value">{employee.employeeId}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Department</span>
                                <span className="info-value">{employee.department?.name || '-'}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Position</span>
                                <span className="info-value">{employee.position}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Hire Date</span>
                                <span className="info-value">
                                    {employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : '-'}
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Salary</span>
                                <span className="info-value">฿{employee.salary?.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="info-card">
                            <h4 className="info-card-title">Personal Information</h4>
                            <div className="info-row">
                                <span className="info-label">Date of Birth</span>
                                <span className="info-value">
                                    {employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString() : '-'}
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Gender</span>
                                <span className="info-value" style={{ textTransform: 'capitalize' }}>
                                    {employee.gender || '-'}
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Address</span>
                                <span className="info-value">
                                    {employee.address?.street ?
                                        `${employee.address.street}, ${employee.address.city}` : '-'}
                                </span>
                            </div>
                        </div>

                        <div className="info-card">
                            <h4 className="info-card-title">Leave Balance</h4>
                            <div className="info-row">
                                <span className="info-label">Annual Leave</span>
                                <span className="info-value">{employee.leaveBalance?.annual || 0} days</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Sick Leave</span>
                                <span className="info-value">{employee.leaveBalance?.sick || 0} days</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Personal Leave</span>
                                <span className="info-value">{employee.leaveBalance?.personal || 0} days</span>
                            </div>
                        </div>

                        <div className="info-card">
                            <h4 className="info-card-title">Bank Account</h4>
                            <div className="info-row">
                                <span className="info-label">Bank</span>
                                <span className="info-value">{employee.bankAccount?.bankName || '-'}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Account Number</span>
                                <span className="info-value">{employee.bankAccount?.accountNumber || '-'}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Account Name</span>
                                <span className="info-value">{employee.bankAccount?.accountName || '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default EmployeeDetail;
