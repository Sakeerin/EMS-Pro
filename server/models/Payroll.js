import mongoose from 'mongoose';
import { BUSINESS_RULES } from '../config/constants.js';

const payrollSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: [true, 'Employee is required']
    },
    month: {
        type: Number,
        required: [true, 'Month is required'],
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: [true, 'Year is required']
    },
    baseSalary: {
        type: Number,
        required: [true, 'Base salary is required']
    },
    workingDays: {
        type: Number,
        default: 0
    },
    overtime: {
        hours: { type: Number, default: 0 },
        rate: { type: Number, default: 1.5 },
        amount: { type: Number, default: 0 }
    },
    allowances: {
        housing: { type: Number, default: 0 },
        transport: { type: Number, default: 0 },
        meal: { type: Number, default: 0 },
        other: { type: Number, default: 0 }
    },
    deductions: {
        tax: { type: Number, default: 0 },
        socialSecurity: { type: Number, default: 0 },
        providentFund: { type: Number, default: 0 },
        lateDeduction: { type: Number, default: 0 },
        other: { type: Number, default: 0 }
    },
    bonus: {
        type: Number,
        default: 0
    },
    grossSalary: {
        type: Number,
        default: 0
    },
    totalDeductions: {
        type: Number,
        default: 0
    },
    netSalary: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['draft', 'pending', 'approved', 'paid'],
        default: 'draft'
    },
    paymentDate: {
        type: Date
    },
    paymentMethod: {
        type: String,
        enum: ['bank_transfer', 'cash', 'cheque'],
        default: 'bank_transfer'
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

// Compound index for unique payroll per employee per month/year
payrollSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

// Extracted calculation logic so it can be reused in bulk inserts
payrollSchema.statics.calculateTotals = function (doc) {
    // Calculate overtime amount
    const monthlyDays = BUSINESS_RULES?.STANDARD_MONTHLY_WORKING_DAYS || 22;
    const dailyHours = BUSINESS_RULES?.STANDARD_WORKING_HOURS || 8;
    const hourlyRate = doc.baseSalary / (monthlyDays * dailyHours);
    
    if (!doc.overtime) doc.overtime = { hours: 0, rate: 1.5, amount: 0 };
    if (!doc.allowances) doc.allowances = { housing: 0, transport: 0, meal: 0, other: 0 };
    if (!doc.deductions) doc.deductions = { tax: 0, socialSecurity: 0, providentFund: 0, lateDeduction: 0, other: 0 };
    if (!doc.bonus) doc.bonus = 0;

    doc.overtime.amount = (doc.overtime.hours || 0) * hourlyRate * (doc.overtime.rate || 1.5);

    // Calculate gross salary — explicitly sum known allowance fields
    const totalAllowances = (doc.allowances.housing || 0) +
        (doc.allowances.transport || 0) +
        (doc.allowances.meal || 0) +
        (doc.allowances.other || 0);
    doc.grossSalary = doc.baseSalary + doc.overtime.amount + totalAllowances + doc.bonus;

    // Calculate total deductions — explicitly sum known deduction fields
    doc.totalDeductions = (doc.deductions.tax || 0) +
        (doc.deductions.socialSecurity || 0) +
        (doc.deductions.providentFund || 0) +
        (doc.deductions.lateDeduction || 0) +
        (doc.deductions.other || 0);

    // Calculate net salary
    doc.netSalary = doc.grossSalary - doc.totalDeductions;

    return doc;
};

// Calculate totals before saving
payrollSchema.pre('save', function (next) {
    this.constructor.calculateTotals(this);
    next();
});

export default mongoose.model('Payroll', payrollSchema);
