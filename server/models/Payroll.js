import mongoose from 'mongoose';

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

// Calculate totals before saving
payrollSchema.pre('save', function (next) {
    // Calculate overtime amount
    const hourlyRate = this.baseSalary / (22 * 8); // Assuming 22 working days, 8 hours per day
    this.overtime.amount = this.overtime.hours * hourlyRate * this.overtime.rate;

    // Calculate gross salary
    const totalAllowances = Object.values(this.allowances).reduce((sum, val) => sum + (val || 0), 0);
    this.grossSalary = this.baseSalary + this.overtime.amount + totalAllowances + this.bonus;

    // Calculate total deductions
    this.totalDeductions = Object.values(this.deductions).reduce((sum, val) => sum + (val || 0), 0);

    // Calculate net salary
    this.netSalary = this.grossSalary - this.totalDeductions;

    next();
});

export default mongoose.model('Payroll', payrollSchema);
