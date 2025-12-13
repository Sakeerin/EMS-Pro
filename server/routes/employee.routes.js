import express from 'express';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
router.post('/', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const employee = await Employee.create(req.body);

        // Generate random password (10 characters, alphanumeric)
        const generateRandomPassword = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let password = '';
            for (let i = 0; i < 10; i++) {
                password += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return password;
        };

        // Always create user account for new employee
        const randomPassword = generateRandomPassword();
        const user = await User.create({
            email: req.body.email,
            password: randomPassword,
            tempPassword: randomPassword, // Store plain password for HR to view
            role: 'employee',
            employee: employee._id,
            isActive: true
        });

        res.status(201).json({
            success: true,
            data: employee,
            userCreated: true,
            message: `Employee created. User account created with email: ${req.body.email}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private (Admin, HR)
router.put('/:id', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('department', 'name code');

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

// @route   DELETE /api/employees/:id
// @desc    Delete employee
// @access  Private (Admin)
router.delete('/:id', protect, authorize('superadmin', 'admin'), async (req, res) => {
    try {
        const employee = await Employee.findByIdAndDelete(req.params.id);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Also delete associated user account
        await User.findOneAndDelete({ employee: req.params.id });

        res.json({
            success: true,
            message: 'Employee deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
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

// @route   GET /api/employees/stats/overview
// @desc    Get employee statistics
// @access  Private
router.get('/stats/overview', protect, async (req, res) => {
    try {
        const stats = await Employee.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const departmentStats = await Employee.aggregate([
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
            message: error.message
        });
    }
});

// @route   GET /api/employees/supervisors
// @desc    Get list of employees who can be heads/managers based on level hierarchy and department
// @access  Private (Admin, HR)
router.get('/supervisors', protect, authorize('superadmin', 'admin', 'hr'), async (req, res) => {
    try {
        const { level, department } = req.query;

        // Define level hierarchy for filtering heads
        // Hierarchy order: officer < supervisor < assistant_manager < manager < avp < vp < c-level < ceo
        // Each level can report to any level above it
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

        // Strategy: Try to find managers in the same department first, prioritizing by level
        // If department is specified, first look for same-department managers
        // If none found in same department, include managers from all departments

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
