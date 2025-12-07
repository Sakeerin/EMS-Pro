import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiDollarSign, FiFileText, FiDownload, FiCheck } from 'react-icons/fi';
import { payrollAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './Payroll.css';

const PayrollPage = () => {
    const { isHR, isAdmin } = useAuth();
    const [payrolls, setPayrolls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(isHR ? 'all' : 'my');
    const [selectedPayroll, setSelectedPayroll] = useState(null);
    const [generating, setGenerating] = useState(false);

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    useEffect(() => {
        fetchPayrolls();
    }, [activeTab]);

    const fetchPayrolls = async () => {
        setLoading(true);
        try {
            const response = activeTab === 'my'
                ? await payrollAPI.getMy()
                : await payrollAPI.getAll({ month: currentMonth, year: currentYear });
            setPayrolls(response.data.data);
        } catch (error) {
            console.error('Failed to fetch payrolls:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            await payrollAPI.generate({ month: currentMonth, year: currentYear });
            toast.success('Payroll generated successfully');
            fetchPayrolls();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to generate payroll');
        } finally {
            setGenerating(false);
        }
    };

    const handleApprove = async (id) => {
        try {
            await payrollAPI.approve(id);
            toast.success('Payroll approved');
            fetchPayrolls();
        } catch (error) {
            toast.error('Failed to approve payroll');
        }
    };

    const handleMarkPaid = async (id) => {
        try {
            await payrollAPI.markPaid(id);
            toast.success('Payroll marked as paid');
            fetchPayrolls();
        } catch (error) {
            toast.error('Failed to mark as paid');
        }
    };

    const viewPayslip = async (id) => {
        try {
            const { data } = await payrollAPI.getById(id);
            setSelectedPayroll(data.data);
        } catch (error) {
            toast.error('Failed to load payslip');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: 'THB',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    const getMonthName = (month) => {
        return new Date(2000, month - 1).toLocaleString('en-US', { month: 'long' });
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Payroll</h1>
                    <p className="page-subtitle">{getMonthName(currentMonth)} {currentYear}</p>
                </div>
                {isAdmin && (
                    <button
                        onClick={handleGenerate}
                        className="btn btn-primary"
                        disabled={generating}
                    >
                        <FiDollarSign />
                        {generating ? 'Generating...' : 'Generate Payroll'}
                    </button>
                )}
            </div>

            {/* Tabs */}
            {isHR && (
                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'my' ? 'active' : ''}`}
                        onClick={() => setActiveTab('my')}
                    >
                        My Payslips
                    </button>
                    <button
                        className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveTab('all')}
                    >
                        All Payroll
                    </button>
                </div>
            )}

            {/* Payroll Table */}
            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                {activeTab === 'all' && <th>Employee</th>}
                                <th>Period</th>
                                <th>Base Salary</th>
                                <th>Overtime</th>
                                <th>Deductions</th>
                                <th>Net Salary</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan={activeTab === 'all' ? 8 : 7}>
                                            <div className="skeleton" style={{ height: 40 }}></div>
                                        </td>
                                    </tr>
                                ))
                            ) : payrolls.length === 0 ? (
                                <tr>
                                    <td colSpan={activeTab === 'all' ? 8 : 7} className="text-center text-secondary" style={{ padding: 40 }}>
                                        No payroll records found
                                    </td>
                                </tr>
                            ) : (
                                payrolls.map((payroll) => (
                                    <tr key={payroll._id}>
                                        {activeTab === 'all' && (
                                            <td>{payroll.employee?.firstName} {payroll.employee?.lastName}</td>
                                        )}
                                        <td>{getMonthName(payroll.month)} {payroll.year}</td>
                                        <td>{formatCurrency(payroll.baseSalary)}</td>
                                        <td className="text-success">+{formatCurrency(payroll.overtime?.amount)}</td>
                                        <td className="text-danger">-{formatCurrency(payroll.totalDeductions)}</td>
                                        <td className="font-semibold">{formatCurrency(payroll.netSalary)}</td>
                                        <td>
                                            <span className={`badge badge-${payroll.status === 'paid' ? 'success' :
                                                    payroll.status === 'approved' ? 'info' :
                                                        payroll.status === 'pending' ? 'warning' : 'secondary'
                                                }`}>
                                                {payroll.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => viewPayslip(payroll._id)}
                                                    className="btn btn-ghost btn-sm btn-icon"
                                                    title="View Payslip"
                                                >
                                                    <FiFileText />
                                                </button>
                                                {isAdmin && payroll.status === 'draft' && (
                                                    <button
                                                        onClick={() => handleApprove(payroll._id)}
                                                        className="btn btn-success btn-sm btn-icon"
                                                        title="Approve"
                                                    >
                                                        <FiCheck />
                                                    </button>
                                                )}
                                                {isAdmin && payroll.status === 'approved' && (
                                                    <button
                                                        onClick={() => handleMarkPaid(payroll._id)}
                                                        className="btn btn-primary btn-sm btn-icon"
                                                        title="Mark as Paid"
                                                    >
                                                        <FiDollarSign />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payslip Modal */}
            {selectedPayroll && (
                <div className="modal-overlay" onClick={() => setSelectedPayroll(null)}>
                    <motion.div
                        className="modal payslip-modal"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <div className="modal-header">
                            <h3 className="modal-title">Payslip</h3>
                            <button className="modal-close" onClick={() => setSelectedPayroll(null)}>×</button>
                        </div>
                        <div className="modal-body payslip-content">
                            <div className="payslip-header">
                                <h2>Employee Management System</h2>
                                <p>Payslip for {getMonthName(selectedPayroll.month)} {selectedPayroll.year}</p>
                            </div>

                            <div className="payslip-employee">
                                <div className="payslip-row">
                                    <span>Employee Name</span>
                                    <span>{selectedPayroll.employee?.firstName} {selectedPayroll.employee?.lastName}</span>
                                </div>
                                <div className="payslip-row">
                                    <span>Employee ID</span>
                                    <span>{selectedPayroll.employee?.employeeId}</span>
                                </div>
                                <div className="payslip-row">
                                    <span>Department</span>
                                    <span>{selectedPayroll.employee?.department?.name || '-'}</span>
                                </div>
                            </div>

                            <div className="payslip-section">
                                <h4>Earnings</h4>
                                <div className="payslip-row">
                                    <span>Base Salary</span>
                                    <span>{formatCurrency(selectedPayroll.baseSalary)}</span>
                                </div>
                                <div className="payslip-row">
                                    <span>Overtime ({selectedPayroll.overtime?.hours} hrs)</span>
                                    <span>{formatCurrency(selectedPayroll.overtime?.amount)}</span>
                                </div>
                                <div className="payslip-row">
                                    <span>Bonus</span>
                                    <span>{formatCurrency(selectedPayroll.bonus)}</span>
                                </div>
                                <div className="payslip-row total">
                                    <span>Gross Salary</span>
                                    <span>{formatCurrency(selectedPayroll.grossSalary)}</span>
                                </div>
                            </div>

                            <div className="payslip-section">
                                <h4>Deductions</h4>
                                <div className="payslip-row">
                                    <span>Tax</span>
                                    <span className="text-danger">-{formatCurrency(selectedPayroll.deductions?.tax)}</span>
                                </div>
                                <div className="payslip-row">
                                    <span>Social Security</span>
                                    <span className="text-danger">-{formatCurrency(selectedPayroll.deductions?.socialSecurity)}</span>
                                </div>
                                <div className="payslip-row">
                                    <span>Late Deduction</span>
                                    <span className="text-danger">-{formatCurrency(selectedPayroll.deductions?.lateDeduction)}</span>
                                </div>
                                <div className="payslip-row total">
                                    <span>Total Deductions</span>
                                    <span className="text-danger">-{formatCurrency(selectedPayroll.totalDeductions)}</span>
                                </div>
                            </div>

                            <div className="payslip-net">
                                <span>Net Salary</span>
                                <span>{formatCurrency(selectedPayroll.netSalary)}</span>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setSelectedPayroll(null)}>
                                Close
                            </button>
                            <button className="btn btn-primary">
                                <FiDownload /> Download PDF
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
};

export default PayrollPage;
