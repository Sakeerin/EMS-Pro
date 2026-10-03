import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect, authorize } from '../middleware/auth.js';
import {
    getLeaves,
    getMyLeaves,
    getLeaveBalance,
    createLeaveRequest,
    approveLeaveRequest,
    rejectLeaveRequest,
    cancelLeaveRequest
} from '../controllers/leave.controller.js';

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

router.get('/', protect, getLeaves);
router.get('/my', protect, getMyLeaves);
router.get('/balance', protect, getLeaveBalance);

router.post('/',
    protect,
    [
        body('type')
            .isIn(['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other'])
            .withMessage('Invalid leave type'),
        // Plain calendar dates: a time of day would shift the stored day
        body('startDate')
            .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Start date must be a valid date (YYYY-MM-DD)').bail()
            .isISO8601({ strict: true }).withMessage('Start date must be a valid date (YYYY-MM-DD)'),
        body('endDate')
            .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('End date must be a valid date (YYYY-MM-DD)').bail()
            .isISO8601({ strict: true }).withMessage('End date must be a valid date (YYYY-MM-DD)'),
        body('reason')
            .notEmpty().withMessage('Reason is required')
            .trim(),
        body('employeeId')
            .optional()
            .isMongoId().withMessage('Invalid employee ID'),
    ],
    validate,
    createLeaveRequest
);

router.put('/:id/approve', protect, authorize('superadmin', 'admin', 'hr'), approveLeaveRequest);

router.put('/:id/reject', protect, authorize('superadmin', 'admin', 'hr'), rejectLeaveRequest);

router.delete('/:id', protect, cancelLeaveRequest);

export default router;
