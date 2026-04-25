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

// Calculate days before saving (Business Days only)
leaveSchema.pre('save', function (next) {
    if (this.startDate && this.endDate) {
        let businessDays = 0;
        let currentDate = new Date(this.startDate);
        currentDate.setHours(0, 0, 0, 0); // Normalize time
        
        const endDate = new Date(this.endDate);
        endDate.setHours(0, 0, 0, 0); // Normalize time
        
        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            // Count if not Saturday (6) and not Sunday (0)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                businessDays++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        this.days = businessDays;
    }
    next();
});

export default mongoose.model('Leave', leaveSchema);
