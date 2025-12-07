import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiUser, FiMail, FiPhone, FiMapPin, FiCalendar, FiDollarSign, FiArrowLeft, FiUpload } from 'react-icons/fi';
import { employeeAPI, departmentAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './Employees.css';

const EmployeeForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id);

    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [formData, setFormData] = useState({
        employeeId: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        position: '',
        department: '',
        hireDate: new Date().toISOString().split('T')[0],
        salary: '',
        dateOfBirth: '',
        gender: '',
        address: {
            street: '',
            city: '',
            state: '',
            zipCode: '',
            country: 'Thailand'
        },
        emergencyContact: {
            name: '',
            phone: '',
            relationship: ''
        },
        bankAccount: {
            bankName: '',
            accountNumber: '',
            accountName: ''
        },
        status: 'active'
    });

    useEffect(() => {
        fetchDepartments();
        if (isEdit) {
            fetchEmployee();
        }
    }, [id]);

    const fetchDepartments = async () => {
        try {
            const { data } = await departmentAPI.getAll();
            setDepartments(data.data);
        } catch (error) {
            console.error('Failed to fetch departments:', error);
        }
    };

    const fetchEmployee = async () => {
        try {
            const { data } = await employeeAPI.getById(id);
            const emp = data.data;
            setFormData({
                ...emp,
                department: emp.department?._id || '',
                hireDate: emp.hireDate?.split('T')[0] || '',
                dateOfBirth: emp.dateOfBirth?.split('T')[0] || '',
                address: emp.address || formData.address,
                emergencyContact: emp.emergencyContact || formData.emergencyContact,
                bankAccount: emp.bankAccount || formData.bankAccount
            });
        } catch (error) {
            toast.error('Failed to fetch employee');
            navigate('/employees');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isEdit) {
                await employeeAPI.update(id, formData);
                toast.success('Employee updated successfully');
            } else {
                await employeeAPI.create(formData);
                toast.success('Employee created successfully');
            }
            navigate('/employees');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleNestedChange = (parent, field, value) => {
        setFormData(prev => ({
            ...prev,
            [parent]: { ...prev[parent], [field]: value }
        }));
    };

    return (
        <motion.div
            className="employee-form-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            <div className="page-header">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/employees')} className="btn btn-ghost btn-icon">
                        <FiArrowLeft />
                    </button>
                    <div>
                        <h1 className="page-title">{isEdit ? 'Edit Employee' : 'Add New Employee'}</h1>
                        <p className="page-subtitle">Fill in the employee information</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="card">
                    <div className="card-body">
                        {/* Basic Information */}
                        <div className="form-section">
                            <h3 className="form-section-title"><FiUser /> Basic Information</h3>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Employee ID *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.employeeId}
                                        onChange={(e) => handleChange('employeeId', e.target.value)}
                                        placeholder="EMP001"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select
                                        className="form-input form-select"
                                        value={formData.status}
                                        onChange={(e) => handleChange('status', e.target.value)}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                        <option value="on_leave">On Leave</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">First Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.firstName}
                                        onChange={(e) => handleChange('firstName', e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Last Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.lastName}
                                        onChange={(e) => handleChange('lastName', e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Email *</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        value={formData.email}
                                        onChange={(e) => handleChange('email', e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Phone</label>
                                    <input
                                        type="tel"
                                        className="form-input"
                                        value={formData.phone}
                                        onChange={(e) => handleChange('phone', e.target.value)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Date of Birth</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.dateOfBirth}
                                        onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Gender</label>
                                    <select
                                        className="form-input form-select"
                                        value={formData.gender}
                                        onChange={(e) => handleChange('gender', e.target.value)}
                                    >
                                        <option value="">Select Gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Work Information */}
                        <div className="form-section">
                            <h3 className="form-section-title"><FiCalendar /> Work Information</h3>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Department *</label>
                                    <select
                                        className="form-input form-select"
                                        value={formData.department}
                                        onChange={(e) => handleChange('department', e.target.value)}
                                        required
                                    >
                                        <option value="">Select Department</option>
                                        {departments.map(dept => (
                                            <option key={dept._id} value={dept._id}>{dept.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Position *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.position}
                                        onChange={(e) => handleChange('position', e.target.value)}
                                        placeholder="e.g. Software Engineer"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Hire Date *</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.hireDate}
                                        onChange={(e) => handleChange('hireDate', e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Base Salary (THB) *</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.salary}
                                        onChange={(e) => handleChange('salary', e.target.value)}
                                        placeholder="50000"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Address */}
                        <div className="form-section">
                            <h3 className="form-section-title"><FiMapPin /> Address</h3>
                            <div className="form-grid">
                                <div className="form-group full-width">
                                    <label className="form-label">Street Address</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.address.street}
                                        onChange={(e) => handleNestedChange('address', 'street', e.target.value)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">City</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.address.city}
                                        onChange={(e) => handleNestedChange('address', 'city', e.target.value)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">State/Province</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.address.state}
                                        onChange={(e) => handleNestedChange('address', 'state', e.target.value)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Zip Code</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.address.zipCode}
                                        onChange={(e) => handleNestedChange('address', 'zipCode', e.target.value)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Country</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.address.country}
                                        onChange={(e) => handleNestedChange('address', 'country', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Bank Account */}
                        <div className="form-section">
                            <h3 className="form-section-title"><FiDollarSign /> Bank Account</h3>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Bank Name</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.bankAccount.bankName}
                                        onChange={(e) => handleNestedChange('bankAccount', 'bankName', e.target.value)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Account Number</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.bankAccount.accountNumber}
                                        onChange={(e) => handleNestedChange('bankAccount', 'accountNumber', e.target.value)}
                                    />
                                </div>

                                <div className="form-group full-width">
                                    <label className="form-label">Account Name</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.bankAccount.accountName}
                                        onChange={(e) => handleNestedChange('bankAccount', 'accountName', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card-footer flex justify-between" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)' }}>
                        <button type="button" onClick={() => navigate('/employees')} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : isEdit ? 'Update Employee' : 'Create Employee'}
                        </button>
                    </div>
                </div>
            </form>
        </motion.div>
    );
};

export default EmployeeForm;
