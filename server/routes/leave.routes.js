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
        body('startDate')
            .isISO8601().withMessage('Valid start date is required'),
        body('endDate')
            .isISO8601().withMessage('Valid end date is required'),
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
