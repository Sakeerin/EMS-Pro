import { useState } from 'react';
import { motion } from 'framer-motion';
import { payrollAPI } from '../../services/api';
import toast from 'react-hot-toast';

// The adjustments an admin may make to a draft payroll (the server refuses any
// other field and recalculates the totals)
const ALLOWANCE_FIELDS = [
    ['housing', 'Housing allowance'],
    ['transport', 'Transport allowance'],
    ['meal', 'Meal allowance'],
    ['other', 'Other allowance']
];
const DEDUCTION_FIELDS = [
    ['tax', 'Tax'],
    ['providentFund', 'Provident fund'],
    ['other', 'Other deductions']
];

const toInput = (value) => String(value ?? 0);
const toAmount = (value) => Number(value) || 0;

// onDone closes the dialog and reloads the list
const PayrollEditModal = ({ payroll, formatCurrency, periodLabel, onClose, onDone }) => {
    const [form, setForm] = useState({
        bonus: toInput(payroll.bonus),
        allowances: Object.fromEntries(ALLOWANCE_FIELDS.map(([key]) => [key, toInput(payroll.allowances?.[key])])),
        deductions: Object.fromEntries(DEDUCTION_FIELDS.map(([key]) => [key, toInput(payroll.deductions?.[key])])),
        paymentMethod: payroll.paymentMethod || 'bank_transfer',
        notes: payroll.notes || ''
    });
    const [saving, setSaving] = useState(false);

    const setAmount = (group, key) => (e) => setForm(current => (
        group ? { ...current, [group]: { ...current[group], [key]: e.target.value } } : { ...current, [key]: e.target.value }
    ));

    // Preview with the same sums the server uses; base salary, overtime, social
    // security and late deductions aren't editable, so they come from the record
    const gross = (payroll.baseSalary || 0) + (payroll.overtime?.amount || 0) + toAmount(form.bonus) +
        ALLOWANCE_FIELDS.reduce((sum, [key]) => sum + toAmount(form.allowances[key]), 0);
    const totalDeductions = (payroll.deductions?.socialSecurity || 0) + (payroll.deductions?.lateDeduction || 0) +
        DEDUCTION_FIELDS.reduce((sum, [key]) => sum + toAmount(form.deductions[key]), 0);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await payrollAPI.update(payroll._id, {
                bonus: toAmount(form.bonus),
                allowances: Object.fromEntries(ALLOWANCE_FIELDS.map(([key]) => [key, toAmount(form.allowances[key])])),
                deductions: Object.fromEntries(DEDUCTION_FIELDS.map(([key]) => [key, toAmount(form.deductions[key])])),
                paymentMethod: form.paymentMethod,
                notes: form.notes
            });
            toast.success('Payroll updated');
            onDone();
        } catch (error) {
            const fieldErrors = error.response?.data?.errors;
            toast.error(fieldErrors?.[0]?.message || error.response?.data?.message || 'Failed to update payroll');
            // Not a typing mistake (e.g. someone approved it meanwhile): show the
            // payroll as it is now instead of leaving the form open
            if (error.response && !fieldErrors) onDone();
        } finally {
            setSaving(false);
        }
    };

    const amountInput = (label, value, onChange, key) => (
        <div className="form-group" key={key}>
            <label className="form-label" htmlFor={`payroll-${key}`}>{label}</label>
            <input
                id={`payroll-${key}`}
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                value={value}
                onChange={onChange}
                required
            />
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <motion.div
                className="modal payroll-edit-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
            >
                <div className="modal-header">
                    <h3 className="modal-title">
                        Adjust payroll: {payroll.employee?.firstName} {payroll.employee?.lastName}, {periodLabel}
                    </h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <p className="payroll-edit-fixed">
                            Base salary {formatCurrency(payroll.baseSalary)} · Overtime {formatCurrency(payroll.overtime?.amount)} ·
                            Social security {formatCurrency(payroll.deductions?.socialSecurity)} · Late deduction {formatCurrency(payroll.deductions?.lateDeduction)}
                            <span> (calculated by the system)</span>
                        </p>

                        <h4 className="payroll-edit-section">Earnings</h4>
                        <div className="payroll-edit-grid">
                            {amountInput('Bonus', form.bonus, setAmount(null, 'bonus'), 'bonus')}
                            {ALLOWANCE_FIELDS.map(([key, label]) =>
                                amountInput(label, form.allowances[key], setAmount('allowances', key), `allowance-${key}`))}
                        </div>

                        <h4 className="payroll-edit-section">Deductions</h4>
                        <div className="payroll-edit-grid">
                            {DEDUCTION_FIELDS.map(([key, label]) =>
                                amountInput(label, form.deductions[key], setAmount('deductions', key), `deduction-${key}`))}
                        </div>

                        <div className="payroll-edit-grid">
                            <div className="form-group">
                                <label className="form-label" htmlFor="payroll-paymentMethod">Payment method</label>
                                <select
                                    id="payroll-paymentMethod"
                                    className="form-input form-select"
                                    value={form.paymentMethod}
                                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                                >
                                    <option value="bank_transfer">Bank transfer</option>
                                    <option value="cash">Cash</option>
                                    <option value="cheque">Cheque</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="payroll-notes">Notes</label>
                            <textarea
                                id="payroll-notes"
                                className="form-input"
                                rows="2"
                                maxLength={1000}
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            />
                        </div>

                        <div className="payroll-edit-totals">
                            <span>Gross {formatCurrency(gross)}</span>
                            <span>Deductions -{formatCurrency(totalDeductions)}</span>
                            <strong>Net {formatCurrency(gross - totalDeductions)}</strong>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Saving...' : 'Save changes'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default PayrollEditModal;
