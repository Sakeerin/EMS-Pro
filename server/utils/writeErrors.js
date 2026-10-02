// Turns Mongoose validation, cast and duplicate-key errors from a write into a
// 400 that says what is wrong; anything else is a 500 with the fallback message
// (never the raw error, which can leak collection and index names).

const DUPLICATE_MESSAGES = {
    email: 'An account with this email already exists',
    employeeId: 'Employee ID already exists',
    name: 'Department name already exists',
    code: 'Department code already exists'
};

const describeValidationItem = (item) => {
    if (item.kind === 'enum') {
        return `${item.path} must be one of: ${item.properties.enumValues.join(', ')}`;
    }
    if (item.name === 'CastError') {
        return `${item.path} has an invalid value`;
    }
    return item.message;
};

export const sendWriteError = (res, error, fallbackMessage) => {
    let errors = null;

    if (error?.name === 'ValidationError') {
        errors = Object.values(error.errors).map((item) => ({ field: item.path, message: describeValidationItem(item) }));
    } else if (error?.name === 'CastError') {
        errors = [{ field: error.path, message: error.path === '_id' ? 'Invalid ID' : `${error.path} has an invalid value` }];
    } else if (error?.code === 11000) {
        const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
        errors = [{ field, message: DUPLICATE_MESSAGES[field] || `${field || 'Value'} already exists` }];
    }

    if (errors) {
        return res.status(400).json({
            success: false,
            message: errors.map((e) => e.message).join('; '),
            errors
        });
    }
    return res.status(500).json({
        success: false,
        message: fallbackMessage
    });
};
