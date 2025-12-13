import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiUser, FiMail, FiPhone, FiMapPin, FiCalendar, FiDollarSign, FiArrowLeft, FiUpload, FiUsers, FiFile, FiRefreshCw } from 'react-icons/fi';
import { employeeAPI, departmentAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './Employees.css';

const EmployeeForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id);

    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [supervisors, setSupervisors] = useState([]);
    const [jdFile, setJdFile] = useState(null);
    const [formData, setFormData] = useState({
        employeeId: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        position: '',
        employeeLevel: 'officer',
        department: '',
        manager: '',
        hireDate: new Date().toISOString().split('T')[0],
        salary: '',
        dateOfBirth: '',
        gender: '',
        jobDescriptionFile: '',
        address: {
            street: '',
            city: '',
            state: '',
            zipCode: '',
            country: 'Thailand'
        },
        family: {
            father: {
                firstName: '',
                lastName: '',
                occupation: '',
                phone: ''
            },
            mother: {
                firstName: '',
                lastName: '',
                occupation: '',
                phone: ''
            },
            spouse: {
                firstName: '',
                lastName: '',
                occupation: '',
                phone: ''
            },
            numberOfChildren: 0
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
        } else {
            generateEmployeeId();
            fetchSupervisors(formData.employeeLevel, formData.department);
        }
    }, [id]);

    // Refetch supervisors when level OR department changes
    useEffect(() => {
        if (!isEdit) {
            fetchSupervisors(formData.employeeLevel, formData.department);
        }
    }, [formData.employeeLevel, formData.department]);

    // Also refetch supervisors when editing and department changes
    useEffect(() => {
        if (isEdit && formData.department) {
            fetchSupervisors(formData.employeeLevel, formData.department);
        }
    }, [formData.department, formData.employeeLevel]);

    const generateEmployeeId = async () => {
        try {
            const { data } = await employeeAPI.generateId();
            setFormData(prev => ({ ...prev, employeeId: data.data.employeeId }));
        } catch (error) {
            console.error('Failed to generate employee ID:', error);
        }
    };

    const fetchDepartments = async () => {
        try {
            const { data } = await departmentAPI.getAll();
            setDepartments(data.data);
        } catch (error) {
            console.error('Failed to fetch departments:', error);
        }
    };

    const fetchSupervisors = async (level, department) => {
        try {
            const { data } = await employeeAPI.getSupervisors(level, department);
            setSupervisors(data.data);
        } catch (error) {
            console.error('Failed to fetch supervisors:', error);
        }
    };

    // Level display labels (ordered from lowest to highest)
    const levelLabels = {
        'officer': 'Officer',
        'supervisor': 'Supervisor',
        'assistant_manager': 'Assistant Manager',
        'manager': 'Manager',
        'avp': 'Assistant Vice President (AVP)',
        'vp': 'Vice President (VP)',
        'c-level': 'C-Level (CTO, CFO, COO, etc.)',
        'ceo': 'CEO'
    };

    const getLevelLabel = (level) => {
        return levelLabels[level] || level;
    };

    const fetchEmployee = async () => {
        try {
            const { data } = await employeeAPI.getById(id);
            const emp = data.data;
            setFormData({
                ...emp,
                department: emp.department?._id || '',
                manager: emp.manager?._id || '',
                employeeLevel: emp.employeeLevel || 'officer',
                hireDate: emp.hireDate?.split('T')[0] || '',
                dateOfBirth: emp.dateOfBirth?.split('T')[0] || '',
                address: emp.address || formData.address,
                family: emp.family || formData.family,
                emergencyContact: emp.emergencyContact || formData.emergencyContact,
                bankAccount: emp.bankAccount || formData.bankAccount
            });
            // Fetch supervisors based on the employee's level and department
            fetchSupervisors(emp.employeeLevel || 'officer', emp.department?._id || '');
        } catch (error) {
            toast.error('Failed to fetch employee');
            navigate('/employees');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            let employeeData = { ...formData };

            if (isEdit) {
                await employeeAPI.update(id, employeeData);

                // Upload JD file if selected
                if (jdFile) {
                    await employeeAPI.uploadJD(id, jdFile);
                }

                toast.success('Employee updated successfully');
            } else {
                const response = await employeeAPI.create(employeeData);

                // Upload JD file if selected
                if (jdFile && response.data.data._id) {
                    await employeeAPI.uploadJD(response.data.data._id, jdFile);
                }

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

    const handleFamilyChange = (member, field, value) => {
        setFormData(prev => ({
            ...prev,
            family: {
                ...prev.family,
                [member]: { ...prev.family[member], [field]: value }
            }
        }));
    };

    const handleJdFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            if (!allowedTypes.includes(file.type)) {
                toast.error('Only PDF and Word documents are allowed');
                return;
            }
            setJdFile(file);
        }
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
                                    <div className="input-with-button">
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.employeeId}
                                            onChange={(e) => handleChange('employeeId', e.target.value)}
                                            placeholder="Auto-generated"
                                            required
                                        />
                                        {!isEdit && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-icon"
                                                onClick={generateEmployeeId}
                                                title="Regenerate ID"
                                            >
                                                <FiRefreshCw />
                                            </button>
                                        )}
                                    </div>
                                    <small className="form-hint">Format: YYXXXX (Thai Year + Sequence)</small>
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
                                    <label className="form-label">Employee Level *</label>
                                    <select
                                        className="form-input form-select"
                                        value={formData.employeeLevel}
                                        onChange={(e) => {
                                            handleChange('employeeLevel', e.target.value);
                                            handleChange('manager', ''); // Reset manager when level changes
                                        }}
                                        required
                                    >
                                        <option value="officer">Officer</option>
                                        <option value="supervisor">Supervisor</option>
                                        <option value="assistant_manager">Assistant Manager</option>
                                        <option value="manager">Manager</option>
                                        <option value="avp">Assistant Vice President (AVP)</option>
                                        <option value="vp">Vice President (VP)</option>
                                        <option value="c-level">C-Level (CTO, CFO, COO, etc.)</option>
                                        <option value="ceo">CEO</option>
                                    </select>
                                    <small className="form-hint">Select level to filter available heads/managers</small>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Head / Manager Name</label>
                                    <select
                                        className="form-input form-select"
                                        value={formData.manager}
                                        onChange={(e) => handleChange('manager', e.target.value)}
                                        disabled={formData.employeeLevel === 'ceo'}
                                    >
                                        <option value="">
                                            {formData.employeeLevel === 'ceo'
                                                ? 'N/A (CEO has no head)'
                                                : 'Select Head/Manager'}
                                        </option>
                                        {supervisors
                                            .filter(sup => sup._id !== id) // Exclude self
                                            .map(sup => (
                                                <option key={sup._id} value={sup._id}>
                                                    {sup.firstName} {sup.lastName} - {getLevelLabel(sup.employeeLevel)} ({sup.position})
                                                </option>
                                            ))}
                                    </select>
                                    {formData.employeeLevel !== 'ceo' && supervisors.length === 0 && (
                                        <small className="form-hint text-warning">No available heads for this level</small>
                                    )}
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

                                <div className="form-group">
                                    <label className="form-label">Job Description File</label>
                                    <div className="file-upload-wrapper">
                                        <input
                                            type="file"
                                            id="jd-file"
                                            accept=".pdf,.doc,.docx"
                                            onChange={handleJdFileChange}
                                            className="file-input"
                                        />
                                        <label htmlFor="jd-file" className="file-upload-btn">
                                            <FiUpload /> {jdFile ? jdFile.name : (formData.jobDescriptionFile ? 'Change File' : 'Upload JD')}
                                        </label>
                                        {formData.jobDescriptionFile && !jdFile && (
                                            <a
                                                href={formData.jobDescriptionFile}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-ghost btn-sm"
                                            >
                                                <FiFile /> View Current
                                            </a>
                                        )}
                                    </div>
                                    <small className="form-hint">PDF, DOC, DOCX (Max 10MB)</small>
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

                        {/* Family Information */}
                        <div className="form-section">
                            <h3 className="form-section-title"><FiUsers /> Family Information</h3>

                            {/* Father */}
                            <div className="family-member-section">
                                <h4 className="subsection-title">Father</h4>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label className="form-label">First Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.father.firstName}
                                            onChange={(e) => handleFamilyChange('father', 'firstName', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Last Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.father.lastName}
                                            onChange={(e) => handleFamilyChange('father', 'lastName', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Occupation / Career</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.father.occupation}
                                            onChange={(e) => handleFamilyChange('father', 'occupation', e.target.value)}
                                            placeholder="e.g. Business Owner"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input
                                            type="tel"
                                            className="form-input"
                                            value={formData.family.father.phone}
                                            onChange={(e) => handleFamilyChange('father', 'phone', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Mother */}
                            <div className="family-member-section">
                                <h4 className="subsection-title">Mother</h4>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label className="form-label">First Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.mother.firstName}
                                            onChange={(e) => handleFamilyChange('mother', 'firstName', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Last Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.mother.lastName}
                                            onChange={(e) => handleFamilyChange('mother', 'lastName', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Occupation / Career</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.mother.occupation}
                                            onChange={(e) => handleFamilyChange('mother', 'occupation', e.target.value)}
                                            placeholder="e.g. Housewife"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input
                                            type="tel"
                                            className="form-input"
                                            value={formData.family.mother.phone}
                                            onChange={(e) => handleFamilyChange('mother', 'phone', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Spouse (Optional) */}
                            <div className="family-member-section">
                                <h4 className="subsection-title">Spouse (Optional)</h4>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label className="form-label">First Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.spouse.firstName}
                                            onChange={(e) => handleFamilyChange('spouse', 'firstName', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Last Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.spouse.lastName}
                                            onChange={(e) => handleFamilyChange('spouse', 'lastName', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Occupation / Career</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.family.spouse.occupation}
                                            onChange={(e) => handleFamilyChange('spouse', 'occupation', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input
                                            type="tel"
                                            className="form-input"
                                            value={formData.family.spouse.phone}
                                            onChange={(e) => handleFamilyChange('spouse', 'phone', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Number of Children</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.family.numberOfChildren}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            family: { ...prev.family, numberOfChildren: parseInt(e.target.value) || 0 }
                                        }))}
                                        min="0"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Emergency Contact */}
                        <div className="form-section">
                            <h3 className="form-section-title"><FiPhone /> Emergency Contact</h3>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Contact Name</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.emergencyContact.name}
                                        onChange={(e) => handleNestedChange('emergencyContact', 'name', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Contact Phone</label>
                                    <input
                                        type="tel"
                                        className="form-input"
                                        value={formData.emergencyContact.phone}
                                        onChange={(e) => handleNestedChange('emergencyContact', 'phone', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Relationship</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.emergencyContact.relationship}
                                        onChange={(e) => handleNestedChange('emergencyContact', 'relationship', e.target.value)}
                                        placeholder="e.g. Spouse, Parent"
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
