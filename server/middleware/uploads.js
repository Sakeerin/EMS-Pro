import path from 'path';
import Employee from '../models/Employee.js';

const HR_ROLES = ['superadmin', 'admin', 'hr'];

// Job description files are visible only to HR/admin roles and to the employee
// the file belongs to. Runs after protect and before the static file handler.
export const authorizeJobDescription = async (req, res, next) => {
    if (HR_ROLES.includes(req.user.role)) {
        return next();
    }
    try {
        // Only plain file names directly under /uploads/jd
        const requested = decodeURIComponent(req.path).slice(1);
        if (requested && requested === path.basename(requested) && req.user.employee) {
            const isOwner = await Employee.exists({
                _id: req.user.employee,
                jobDescriptionFile: `/uploads/jd/${requested}`
            });
            if (isOwner) {
                return next();
            }
        }
    } catch (error) {
        // Malformed escapes and lookup errors fall through to the 403 below
    }
    return res.status(403).json({
        success: false,
        message: 'Not authorized to access this file'
    });
};
