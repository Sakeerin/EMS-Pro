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
    // Overtime is only paid once HR approves it
    overtimeStatus: {
        type: String,
        enum: ['none', 'pending', 'approved', 'rejected'],
        default: 'none'
    },
    overtimeReviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    overtimeReviewedAt: Date,
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
        const spanHours = diffMs / (1000 * 60 * 60);

        // Recorded break times
        let breakHours = 0;
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
            breakHours = totalBreakMs / (1000 * 60 * 60);
        }

        // Nothing records the lunch break, so a long day always loses at least
        // the statutory unpaid hour
        if (spanHours > BUSINESS_RULES.LUNCH_BREAK_AFTER_HOURS) {
            breakHours = Math.max(breakHours, BUSINESS_RULES.LUNCH_BREAK_HOURS);
        }

        const hours = Math.max(0, spanHours - breakHours); // Ensure working hours don't go negative
        this.workingHours = Math.round(hours * 100) / 100;

        // Calculate overtime using standard working hours from BUSINESS_RULES
        const standardHours = BUSINESS_RULES?.STANDARD_WORKING_HOURS || 8;
        if (hours > standardHours) {
            this.overtime = Math.round((hours - standardHours) * 100) / 100;
        } else {
            this.overtime = 0;
        }

        // New overtime, or hours changed after a review, waits for (another) HR decision
        let overtimeStatus = this.overtimeStatus;
        if (this.overtime === 0) {
            overtimeStatus = 'none';
        } else if (overtimeStatus === 'none' || this.isModified('checkIn') || this.isModified('checkOut')) {
            overtimeStatus = 'pending';
        }
        if (overtimeStatus !== this.overtimeStatus) {
            this.overtimeStatus = overtimeStatus;
            this.overtimeReviewedBy = undefined;
            this.overtimeReviewedAt = undefined;
        }
    }
    next();
});

export default mongoose.model('Attendance', attendanceSchema);
