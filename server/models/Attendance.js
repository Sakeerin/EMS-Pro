import mongoose from 'mongoose';
import { BUSINESS_RULES } from '../config/constants.js';

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
        let hours = diffMs / (1000 * 60 * 60);

        // Deduct break times
        if (this.breaks && this.breaks.length > 0) {
            const totalBreakMs = this.breaks.reduce((total, b) => {
                if (b.duration) {
                    return total + (b.duration * 60 * 1000); // Assume duration is in minutes
                }
                if (b.startTime && b.endTime) {
                    return total + (b.endTime - b.startTime);
                }
                return total;
            }, 0);
            
            const breakHours = totalBreakMs / (1000 * 60 * 60);
            hours = Math.max(0, hours - breakHours); // Ensure working hours don't go negative
        }

        this.workingHours = Math.round(hours * 100) / 100;

        // Calculate overtime using standard working hours from BUSINESS_RULES
        const standardHours = BUSINESS_RULES?.STANDARD_WORKING_HOURS || 8;
        if (hours > standardHours) {
            this.overtime = Math.round((hours - standardHours) * 100) / 100;
        } else {
            this.overtime = 0;
        }
    }
    next();
});

export default mongoose.model('Attendance', attendanceSchema);
