import mongoose from 'mongoose';
import crypto from 'crypto';
import Employee from '../models/Employee.js';
import User from '../models/User.js';

// Helper function to get Thai year
const getThaiYear = () => {
    const currentYear = new Date().getFullYear();
    const thaiYear = currentYear + 543; // Convert to Buddhist Era
    return thaiYear.toString().slice(-2); // Get last 2 digits
};

// @desc    Generate next employee ID with Thai year format
export const generateId = async (req, res) => {
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
};

// @desc    Get list of employees who can be heads/managers based on level hierarchy and department
export const getSupervisors = async (req, res) => {
    try {
        const { level, department } = req.query;

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

        if (!level || level === 'ceo' || !levelHierarchy[level]) {
            return res.json({ success: true, data: [] });
        }

        const validHeadLevels = levelHierarchy[level];
        let supervisors = [];

        if (department && validHeadLevels.length > 0) {
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
                    break;
                }
            }

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
};

// @desc    Get all employees with pagination, search, filter
export const getEmployees = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let query = {};
        if (req.query.search) {
            query.$text = { $search: req.query.search };
        }
        if (req.query.department) {
            query.department = req.query.department;
        }
        if (req.query.status) {
            query.status = req.query.status;
        }

        const total = await Employee.countDocuments(query);
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
};

// @desc    Get employee statistics
export const getEmployeeStats = async (req, res) => {
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
};

// @desc    Get employee by ID
export const getEmployeeById = async (req, res) => {
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
};

// @desc    Create new employee
export const createEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const employee = new Employee(req.body);
        await employee.save({ session });

        const randomPassword = crypto.randomBytes(4).toString('hex') + 'A1';

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
};

// @desc    Update employee
export const updateEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const employeeToUpdate = await Employee.findById(req.params.id);
        if (!employeeToUpdate) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }
        
        const emailChanged = req.body.email && req.body.email !== employeeToUpdate.email;

        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true, session }
        ).populate('department', 'name code');

        if (emailChanged) {
            await User.findOneAndUpdate(
                { employee: employee._id },
                { email: req.body.email },
                { session }
            );
        }

        await session.commitTransaction();
        session.endSession();

        res.json({
            success: true,
            data: employee
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({
            success: false,
            message: 'Failed to update employee'
        });
    }
};

// @desc    Delete employee (with cascade cleanup)
export const deleteEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const employeeId = req.params.id;
        const employee = await Employee.findById(employeeId);

        if (!employee) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        const Attendance = (await import('../models/Attendance.js')).default;
        const Leave = (await import('../models/Leave.js')).default;
        const Payroll = (await import('../models/Payroll.js')).default;
        const Department = (await import('../models/Department.js')).default;

        await Promise.all([
            Employee.findByIdAndDelete(employeeId).session(session),
            User.findOneAndDelete({ employee: employeeId }).session(session),
            Attendance.deleteMany({ employee: employeeId }).session(session),
            Leave.deleteMany({ employee: employeeId }).session(session),
            Payroll.deleteMany({ employee: employeeId }).session(session),
            Employee.updateMany(
                { manager: employeeId },
                { $unset: { manager: '' } }
            ).session(session),
            Employee.updateMany(
                { supervisor: employeeId },
                { $unset: { supervisor: '' } }
            ).session(session),
            Department.updateMany(
                { manager: employeeId },
                { $unset: { manager: '' } }
            ).session(session),
        ]);

        await session.commitTransaction();
        session.endSession();

        res.json({
            success: true,
            message: 'Employee and all related records deleted successfully'
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({
            success: false,
            message: 'Failed to delete employee'
        });
    }
};

// @desc    Upload employee avatar
export const uploadEmployeeAvatar = async (req, res) => {
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
};

// @desc    Upload Job Description file
export const uploadEmployeeJD = async (req, res) => {
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
};
