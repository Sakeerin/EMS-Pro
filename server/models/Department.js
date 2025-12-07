import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Department name is required'],
        unique: true,
        trim: true
    },
    code: {
        type: String,
        required: [true, 'Department code is required'],
        unique: true,
        uppercase: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    },
    parentDepartment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
    },
    budget: {
        type: Number,
        default: 0
    },
    location: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for employee count
departmentSchema.virtual('employeeCount', {
    ref: 'Employee',
    localField: '_id',
    foreignField: 'department',
    count: true
});

export default mongoose.model('Department', departmentSchema);
