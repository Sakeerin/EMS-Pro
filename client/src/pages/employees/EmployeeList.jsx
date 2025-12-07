import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    FiPlus, FiSearch, FiFilter, FiEdit2, FiTrash2,
    FiChevronLeft, FiChevronRight, FiMail, FiPhone
} from 'react-icons/fi';
import { employeeAPI, departmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './Employees.css';

const EmployeeList = () => {
    const { isHR } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

    const [filters, setFilters] = useState({
        search: searchParams.get('search') || '',
        department: searchParams.get('department') || '',
        status: searchParams.get('status') || ''
    });

    useEffect(() => {
        fetchDepartments();
    }, []);

    useEffect(() => {
        fetchEmployees();
    }, [filters, pagination.page]);

    const fetchDepartments = async () => {
        try {
            const { data } = await departmentAPI.getAll();
            setDepartments(data.data);
        } catch (error) {
            console.error('Failed to fetch departments:', error);
        }
    };

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const { data } = await employeeAPI.getAll({
                page: pagination.page,
                limit: 10,
                search: filters.search,
                department: filters.department,
                status: filters.status
            });
            setEmployees(data.data);
            setPagination(data.pagination);
        } catch (error) {
            toast.error('Failed to fetch employees');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this employee?')) return;

        try {
            await employeeAPI.delete(id);
            toast.success('Employee deleted successfully');
            fetchEmployees();
        } catch (error) {
            toast.error('Failed to delete employee');
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setPagination({ ...pagination, page: 1 });
        setSearchParams(filters);
    };

    return (
        <motion.div
            className="employees-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            <div className="page-header">
                <div>
                    <h1 className="page-title">Employees</h1>
                    <p className="page-subtitle">{pagination.total} employees total</p>
                </div>
                {isHR && (
                    <Link to="/employees/new" className="btn btn-primary">
                        <FiPlus /> Add Employee
                    </Link>
                )}
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <form onSubmit={handleSearch} className="search-box">
                    <FiSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search by name, email, or ID..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    />
                </form>

                <select
                    className="form-input form-select filter-select"
                    value={filters.department}
                    onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                >
                    <option value="">All Departments</option>
                    {departments.map(dept => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                    ))}
                </select>

                <select
                    className="form-input form-select filter-select"
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                </select>
            </div>

            {/* Employee Table */}
            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Position</th>
                                <th>Department</th>
                                <th>Contact</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan="6">
                                            <div className="skeleton" style={{ height: 48, marginBottom: 8 }}></div>
                                        </td>
                                    </tr>
                                ))
                            ) : employees.length === 0 ? (
                                <tr>
                                    <td colSpan="6">
                                        <div className="empty-state">
                                            <p>No employees found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                employees.map((employee) => (
                                    <motion.tr
                                        key={employee._id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                                    >
                                        <td>
                                            <div className="employee-cell">
                                                <div className="avatar">
                                                    {employee.avatar ? (
                                                        <img src={employee.avatar} alt="" />
                                                    ) : (
                                                        `${employee.firstName?.[0]}${employee.lastName?.[0]}`
                                                    )}
                                                </div>
                                                <div>
                                                    <Link to={`/employees/${employee._id}`} className="employee-name">
                                                        {employee.firstName} {employee.lastName}
                                                    </Link>
                                                    <span className="employee-id">#{employee.employeeId}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{employee.position}</td>
                                        <td>
                                            <span className="department-badge">
                                                {employee.department?.name || '-'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="contact-info">
                                                <a href={`mailto:${employee.email}`} className="contact-link">
                                                    <FiMail /> {employee.email}
                                                </a>
                                                {employee.phone && (
                                                    <a href={`tel:${employee.phone}`} className="contact-link">
                                                        <FiPhone /> {employee.phone}
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge badge-${employee.status === 'active' ? 'success' : employee.status === 'on_leave' ? 'warning' : 'danger'}`}>
                                                {employee.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="action-btns">
                                                <Link
                                                    to={`/employees/${employee._id}/edit`}
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    title="Edit"
                                                >
                                                    <FiEdit2 />
                                                </Link>
                                                {isHR && (
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm text-danger"
                                                        onClick={() => handleDelete(employee._id)}
                                                        title="Delete"
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                    <div className="table-footer">
                        <div className="pagination">
                            <button
                                className="pagination-btn"
                                disabled={pagination.page === 1}
                                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                            >
                                <FiChevronLeft />
                            </button>

                            {[...Array(pagination.pages)].map((_, i) => (
                                <button
                                    key={i}
                                    className={`pagination-btn ${pagination.page === i + 1 ? 'active' : ''}`}
                                    onClick={() => setPagination({ ...pagination, page: i + 1 })}
                                >
                                    {i + 1}
                                </button>
                            ))}

                            <button
                                className="pagination-btn"
                                disabled={pagination.page === pagination.pages}
                                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                            >
                                <FiChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default EmployeeList;
