import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: [true, 'Employee is required']
    },
    date: {
        type: Date,
        required: [true, 'Date is required'],
        default: () => new Date().setHours(0, 0, 0, 0)
    },
    checkIn: {
        time: Date,
        location: {
            latitude: Number,
            longitude: Number,
            address: String
        },
        note: String
    },
    checkOut: {
        time: Date,
        location: {
            latitude: Number,
            longitude: Number,
            address: String
        },
        note: String
    },
    workingHours: {
        type: Number,
        default: 0
    },
    overtime: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['present', 'late', 'absent', 'half_day', 'holiday', 'weekend'],
        default: 'present'
    },
    breaks: [{
        startTime: Date,
        endTime: Date,
        duration: Number
    }]
}, {
    timestamps: true
});

// Compound index for unique attendance per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

// Calculate working hours before saving
attendanceSchema.pre('save', function (next) {
    if (this.checkIn?.time && this.checkOut?.time) {
        const diffMs = this.checkOut.time - this.checkIn.time;
        const hours = diffMs / (1000 * 60 * 60);
        this.workingHours = Math.round(hours * 100) / 100;

        // Calculate overtime (assuming 8 hours is standard)
        if (hours > 8) {
            this.overtime = Math.round((hours - 8) * 100) / 100;
        }
    }
    next();
});

export default mongoose.model('Attendance', attendanceSchema);
