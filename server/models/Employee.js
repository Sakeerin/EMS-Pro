import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        required: [true, 'Employee ID is required'],
        unique: true,
        trim: true
    },
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    avatar: {
        type: String,
        default: ''
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: [true, 'Department is required']
    },
    position: {
        type: String,
        required: [true, 'Position is required'],
        trim: true
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    },
    dateOfBirth: {
        type: Date
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other']
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: { type: String, default: 'Thailand' }
    },
    hireDate: {
        type: Date,
        required: [true, 'Hire date is required'],
        default: Date.now
    },
    salary: {
        type: Number,
        required: [true, 'Salary is required'],
        min: [0, 'Salary cannot be negative']
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'terminated', 'on_leave'],
        default: 'active'
    },
    emergencyContact: {
        name: String,
        phone: String,
        relationship: String
    },
    bankAccount: {
        bankName: String,
        accountNumber: String,
        accountName: String
    },
    leaveBalance: {
        annual: { type: Number, default: 12 },
        sick: { type: Number, default: 30 },
        personal: { type: Number, default: 5 }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full name
employeeSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`;
});

// Index for search
employeeSchema.index({ firstName: 'text', lastName: 'text', email: 'text', employeeId: 'text' });

export default mongoose.model('Employee', employeeSchema);
