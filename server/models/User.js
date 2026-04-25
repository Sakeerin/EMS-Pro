import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Password validation regex: min 8 chars, at least 1 uppercase, 1 lowercase, 1 number
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select: false
    },
    role: {
        type: String,
        enum: ['superadmin', 'admin', 'hr', 'employee'],
        default: 'employee'
    },
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    // Flag to force password change on first login (for auto-created accounts)
    mustChangePassword: {
        type: Boolean,
        default: false
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date
}, {
    timestamps: true
});

// Static method to validate password strength
userSchema.statics.validatePasswordStrength = function (password) {
    if (!password || password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters' };
    }
    if (!passwordRegex.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number'
        };
    }
    return { valid: true };
};

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
