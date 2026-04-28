import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { protect, authorize } from '../middleware/auth.js';
import { uploadAvatar, uploadJD } from '../services/storage.service.js';
import {
    generateId,
    getSupervisors,
    getEmployees,
    getEmployeeStats,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    uploadEmployeeAvatar,
    uploadEmployeeJD
} from '../controllers/employee.controller.js';

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

router.get('/generate-id', protect, authorize('superadmin', 'admin', 'hr'), generateId);
router.get('/supervisors', protect, authorize('superadmin', 'admin', 'hr'), getSupervisors);
router.get('/', protect, getEmployees);
router.get('/stats/overview', protect, getEmployeeStats);
router.get('/:id', protect, getEmployeeById);

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
    createEmployee
);

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
    updateEmployee
);

router.delete('/:id', protect, authorize('superadmin', 'admin'), deleteEmployee);

router.post('/:id/avatar', protect, uploadAvatar.single('avatar'), uploadEmployeeAvatar);

router.post('/:id/upload-jd', protect, authorize('superadmin', 'admin', 'hr'), uploadJD.single('file'), uploadEmployeeJD);

export default router;
