import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { body, param, validationResult } from 'express-validator';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Validation middleware helper
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
    }
    next();
};

const router = express.Router();

// Ensure upload directories exist
const uploadDirs = ['uploads/avatars', 'uploads/jd'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for avatar upload
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/avatars');
    },
    filename: (req, file, cb) => {
        cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Configure multer for JD file upload
const jdStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/jd');
    },
    filename: (req, file, cb) => {
        cb(null, `jd-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    }
});

const uploadJD = multer({
    storage: jdStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for documents
    fileFilter: (req, file, cb) => {
        const filetypes = /pdf|doc|docx/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (extname) {
            return cb(null, true);
        }
        cb(new Error('Only PDF and Word documents are allowed'));
    }
});

// Helper function to get Thai year
const getThaiYear = () => {
    const currentYear = new Date().getFullYear();
    const thaiYear = currentYear + 543; // Convert to Buddhist Era
    return thaiYear.toString().slice(-2); // Get last 2 digits
};

// @route   GET /api/employees/generate-id
// @desc    Generate next employee ID with Thai year format
// @access  Private (Admin, HR)
router.get('/generate-id', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const thaiYearPrefix = getThaiYear();

        // Find the latest employee ID with current year prefix
        const latestEmployee = await Employee.findOne({
            employeeId: new RegExp(`^${thaiYearPrefix}`)
        }).sort({ employeeId: -1 });

        let nextNumber = 1;
        if (latestEmployee) {
            // Extract the sequence number from the last ID
            const lastNumber = parseInt(latestEmployee.employeeId.slice(2));
            nextNumber = lastNumber + 1;
        }

        // Format: YYXXXX (e.g., 680001)
        const newEmployeeId = `${thaiYearPrefix}${nextNumber.toString().padStart(4, '0')}`;

        res.json({
            success: true,
            data: {
                employeeId: newEmployeeId,
                thaiYear: thaiYearPrefix,
                sequenceNumber: nextNumber
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// @route   GET /api/employees/supervisors
// @desc    Get list of employees who can be heads/managers based on level hierarchy and department
// @access  Private (Admin, HR)
// NOTE: This route MUST be defined before /:id route to prevent Express from treating 'supervisors' as an ID
router.get('/supervisors', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const { level, department } = req.query;

        // Define level hierarchy for filtering heads
        // Hierarchy order: officer < supervisor < assistant_manager < manager < avp < vp < c-level < ceo
        const levelHierarchy = {
            'officer': ['supervisor', 'assistant_manager', 'manager', 'avp', 'vp', 'c-level', 'ceo'],
            'supervisor': ['assistant_manager', 'manager', 'avp', 'vp', 'c-level', 'ceo'],
            'assistant_manager': ['manager', 'avp', 'vp', 'c-level', 'ceo'],
            'manager': ['avp', 'vp', 'c-level', 'ceo'],
            'avp': ['vp', 'c-level', 'ceo'],
            'vp': ['c-level', 'ceo'],
            'c-level': ['ceo'],
            'ceo': []
        };

        // If no level specified or CEO level, return empty
        if (!level || level === 'ceo' || !levelHierarchy[level]) {
            return res.json({ success: true, data: [] });
        }

        const validHeadLevels = levelHierarchy[level];
        let supervisors = [];

        if (department && validHeadLevels.length > 0) {
            // First, try to find supervisors in the same department at each level (lowest first)
            for (const targetLevel of validHeadLevels) {
                const sameDeptSupervisors = await Employee.find({
                    status: 'active',
                    department: department,
                    employeeLevel: targetLevel
                })
                    .select('_id firstName lastName employeeId position employeeLevel department')
                    .populate('department', 'name')
                    .sort({ firstName: 1 });

                if (sameDeptSupervisors.length > 0) {
                    supervisors = sameDeptSupervisors;
                    break; // Found managers at this level, stop looking
                }
            }

            // If no same-department supervisors found, find any supervisor at valid levels
            if (supervisors.length === 0) {
                supervisors = await Employee.find({
                    status: 'active',
                    employeeLevel: { $in: validHeadLevels }
                })
                    .select('_id firstName lastName employeeId position employeeLevel department')
                    .populate('department', 'name')
                    .sort({ employeeLevel: 1, firstName: 1 });
            }
        } else {
            // No department specified, return all valid supervisors
            supervisors = await Employee.find({
                status: 'active',
                employeeLevel: { $in: validHeadLevels }
            })
                .select('_id firstName lastName employeeId position employeeLevel department')
                .populate('department', 'name')
                .sort({ employeeLevel: 1, firstName: 1 });
        }

        res.json({
            success: true,
            data: supervisors
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// @route   GET /api/employees
// @desc    Get all employees with pagination, search, filter
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Build query
        let query = {};

        // Search
        if (req.query.search) {
            query.$text = { $search: req.query.search };
        }

        // Filter by department
        if (req.query.department) {
            query.department = req.query.department;
        }

        // Filter by status
        if (req.query.status) {
            query.status = req.query.status;
        }

        // Get total count
        const total = await Employee.countDocuments(query);

        // Get employees
        const employees = await Employee.find(query)
            .populate('department', 'name code')
            .populate('manager', 'firstName lastName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            data: employees,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   GET /api/employees/stats/overview
// @desc    Get employee statistics
// @access  Private
// NOTE: This route MUST be defined BEFORE /:id to prevent 'stats' being treated as an ID
router.get('/stats/overview', protect, async (req, res) => {
    try {
        const [stats, departmentStats] = await Promise.all([
            Employee.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),
            Employee.aggregate([
                {
                    $group: {
                        _id: '$department',
                        count: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'departments',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'department'
                    }
                },
                {
                    $unwind: '$department'
                },
                {
                    $project: {
                        name: '$department.name',
                        count: 1
                    }
                }
            ])
        ]);

        res.json({
            success: true,
            data: {
                statusStats: stats,
                departmentStats
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employee statistics'
        });
    }
});

// @route   GET /api/employees/:id
// @desc    Get employee by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id)
            .populate('department', 'name code')
            .populate('manager', 'firstName lastName email');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            data: employee
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   POST /api/employees
// @desc    Create new employee
// @access  Private (Admin, HR)
router.post('/',
    protect,
    authorize('superadmin', 'admin', 'hr'),
    [
        body('employeeId').notEmpty().withMessage('Employee ID is required').trim(),
        body('firstName').notEmpty().withMessage('First name is required').trim().escape(),
        body('lastName').notEmpty().withMessage('Last name is required').trim().escape(),
        body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
        body('department').isMongoId().withMessage('Valid department is required'),
        body('position').notEmpty().withMessage('Position is required').trim(),
        body('hireDate').optional().isISO8601().withMessage('Invalid hire date'),
        body('salary').isFloat({ min: 0 }).withMessage('Salary must be a positive number'),
    ],
    validate,
    async (req, res) => {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const employee = new Employee(req.body);
            await employee.save({ session });

            // Generate cryptographically secure random password
            // Format: 4 random bytes hex + 'A' + '1' = ensures uppercase + number requirement
            const randomPassword = crypto.randomBytes(4).toString('hex') + 'A1';

            // Create user account — password will be hashed by User model pre-save hook
            // mustChangePassword forces the user to set their own password on first login
            const user = new User({
                email: req.body.email,
                password: randomPassword,
                role: 'employee',
                employee: employee._id,
                isActive: true,
                mustChangePassword: true
            });
            await user.save({ session });

            await session.commitTransaction();
            session.endSession();

            res.status(201).json({
                success: true,
                data: employee,
                userCreated: true,
                message: `Employee created. User account created with email: ${req.body.email}. User must change password on first login.`
            });
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            
            // If user creation fails, we should still report success for employee
            // but note the user creation issue
            if (error.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: 'An account with this email already exists'
                });
            }
            res.status(500).json({
                success: false,
                message: 'Failed to create employee'
            });
        }
    }
);

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private (Admin, HR)
router.put('/:id',
    protect,
    authorize('superadmin', 'admin', 'hr'),
    [
        param('id').isMongoId().withMessage('Invalid employee ID'),
        body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
        body('salary').optional().isFloat({ min: 0 }).withMessage('Salary must be a positive number'),
        body('department').optional().isMongoId().withMessage('Invalid department ID'),
    ],
    validate,
    async (req, res) => {
        try {
            const employeeToUpdate = await Employee.findById(req.params.id);
            if (!employeeToUpdate) {
                return res.status(404).json({
                    success: false,
                    message: 'Employee not found'
                });
            }
            
            const emailChanged = req.body.email && req.body.email !== employeeToUpdate.email;

            const employee = await Employee.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true }
            ).populate('department', 'name code');

            // Sync email to user account if changed
            if (emailChanged) {
                await User.findOneAndUpdate(
                    { employee: employee._id },
                    { email: req.body.email }
                );
            }

            res.json({
                success: true,
                data: employee
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to update employee'
            });
        }
    }
);

// @route   DELETE /api/employees/:id
// @desc    Delete employee (with cascade cleanup)
// @access  Private (Admin)
router.delete('/:id', protect, authorize('superadmin', 'admin'), async (req, res) => {
    try {
        const employeeId = req.params.id;
        const employee = await Employee.findById(employeeId);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Import models dynamically to avoid circular deps at module level
        const Attendance = (await import('../models/Attendance.js')).default;
        const Leave = (await import('../models/Leave.js')).default;
        const Payroll = (await import('../models/Payroll.js')).default;
        const Department = (await import('../models/Department.js')).default;

        // Cascade cleanup: remove all related records in parallel
        await Promise.all([
            // Delete the employee
            Employee.findByIdAndDelete(employeeId),
            // Delete associated user account
            User.findOneAndDelete({ employee: employeeId }),
            // Delete attendance records
            Attendance.deleteMany({ employee: employeeId }),
            // Delete leave records
            Leave.deleteMany({ employee: employeeId }),
            // Delete payroll records
            Payroll.deleteMany({ employee: employeeId }),
            // Clear manager references on other employees
            Employee.updateMany(
                { manager: employeeId },
                { $unset: { manager: '' } }
            ),
            // Clear supervisor references on other employees
            Employee.updateMany(
                { supervisor: employeeId },
                { $unset: { supervisor: '' } }
            ),
            // Clear department manager references
            Department.updateMany(
                { manager: employeeId },
                { $unset: { manager: '' } }
            ),
        ]);

        res.json({
            success: true,
            message: 'Employee and all related records deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete employee'
        });
    }
});

// @route   POST /api/employees/:id/avatar
// @desc    Upload employee avatar
// @access  Private
router.post('/:id/avatar', protect, uploadAvatar.single('avatar'), async (req, res) => {
    try {
        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            { avatar: `/uploads/avatars/${req.file.filename}` },
            { new: true }
        );

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            data: employee
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// NOTE: /stats/overview route was moved above /:id to fix route ordering.
// NOTE: Duplicate /supervisors route was removed. The primary definition is at line ~131.

// @route   POST /api/employees/:id/upload-jd
// @desc    Upload Job Description file
// @access  Private (Admin, HR)
router.post('/:id/upload-jd', protect, authorize('superadmin', 'admin', 'hr'), uploadJD.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a file'
            });
        }

        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            { jobDescriptionFile: `/uploads/jd/${req.file.filename}` },
            { new: true }
        );

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            data: {
                filePath: `/uploads/jd/${req.file.filename}`,
                filename: req.file.filename
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
