import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiEdit2, FiTrash2, FiUsers } from 'react-icons/fi';
import { departmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const DepartmentList = () => {
    const { isAdmin } = useAuth();
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingDept, setEditingDept] = useState(null);
    const [formData, setFormData] = useState({ name: '', code: '', description: '' });

    useEffect(() => {
        fetchDepartments();
    }, []);

    const fetchDepartments = async () => {
        try {
            const { data } = await departmentAPI.getAll();
            setDepartments(data.data);
        } catch (error) {
            toast.error('Failed to fetch departments');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingDept) {
                await departmentAPI.update(editingDept._id, formData);
                toast.success('Department updated');
            } else {
                await departmentAPI.create(formData);
                toast.success('Department created');
            }
            fetchDepartments();
            closeModal();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this department?')) return;
        try {
            await departmentAPI.delete(id);
            toast.success('Department deleted');
            fetchDepartments();
        } catch (error) {
            toast.error('Failed to delete department');
        }
    };

    const openModal = (dept = null) => {
        if (dept) {
            setEditingDept(dept);
            setFormData({ name: dept.name, code: dept.code, description: dept.description || '' });
        } else {
            setEditingDept(null);
            setFormData({ name: '', code: '', description: '' });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingDept(null);
        setFormData({ name: '', code: '', description: '' });
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Departments</h1>
                    <p className="page-subtitle">{departments.length} departments</p>
                </div>
                {isAdmin && (
                    <button onClick={() => openModal()} className="btn btn-primary">
                        <FiPlus /> Add Department
                    </button>
                )}
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {loading ? (
                    [...Array(4)].map((_, i) => (
                        <div key={i} className="skeleton" style={{ height: 150, borderRadius: 16 }}></div>
                    ))
                ) : (
                    departments.map((dept) => (
                        <motion.div
                            key={dept._id}
                            className="card"
                            whileHover={{ y: -4 }}
                        >
                            <div className="card-body">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="badge badge-primary">{dept.code}</span>
                                    {isAdmin && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => openModal(dept)}
                                                className="btn btn-ghost btn-icon btn-sm"
                                            >
                                                <FiEdit2 />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(dept._id)}
                                                className="btn btn-ghost btn-icon btn-sm text-danger"
                                            >
                                                <FiTrash2 />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{dept.name}</h3>
                                <p className="text-secondary text-sm mb-4">{dept.description || 'No description'}</p>
                                <div className="flex items-center gap-2 text-secondary">
                                    <FiUsers />
                                    <span>{dept.employeeCount || 0} employees</span>
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <motion.div
                        className="modal"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingDept ? 'Edit Department' : 'Add Department'}
                            </h3>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Department Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Code *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                        placeholder="e.g. IT, HR, FIN"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea
                                        className="form-input"
                                        rows="3"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" onClick={closeModal} className="btn btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingDept ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
};

export default DepartmentList;
