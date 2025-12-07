import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: [true, 'Employee is required']
    },
    type: {
        type: String,
        enum: ['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other'],
        required: [true, 'Leave type is required']
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required']
    },
    endDate: {
        type: Date,
        required: [true, 'End date is required']
    },
    days: {
        type: Number,
        required: true
    },
    reason: {
        type: String,
        required: [true, 'Reason is required'],
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled'],
        default: 'pending'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: {
        type: Date
    },
    rejectionReason: {
        type: String,
        trim: true
    },
    attachments: [{
        filename: String,
        path: String
    }]
}, {
    timestamps: true
});

// Calculate days before saving
leaveSchema.pre('save', function (next) {
    if (this.startDate && this.endDate) {
        const diffTime = Math.abs(this.endDate - this.startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        this.days = diffDays;
    }
    next();
});

export default mongoose.model('Leave', leaveSchema);
