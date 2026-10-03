import { param, query } from 'express-validator';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// A plain 24-hex ObjectId. express-validator's isMongoId() also accepts
// 0x-prefixed strings that Mongoose can't cast, which surfaced as 500s
export const objectIdParam = (name, message) => param(name).matches(OBJECT_ID).withMessage(message);

// Query values must be plain strings. Express parses ?status[$ne]=x into an
// object and ?a=1&a=2 into an array; dropped into a Mongo filter, the first is
// an operator and the second tends to crash the query
export const stringQueryOnly = (req, res, next) => {
    const invalid = Object.keys(req.query).filter(key => typeof req.query[key] !== 'string');
    if (invalid.length > 0) {
        return res.status(400).json({
            success: false,
            message: `Invalid query parameter: ${invalid.join(', ')}`
        });
    }
    next();
};

// Optional query filters. An empty value (the "All" choice in the UI) counts as
// not given
export const queryObjectId = (name) =>
    query(name).optional({ values: 'falsy' }).matches(OBJECT_ID).withMessage(`${name} must be a valid ID`);

export const queryDate = (name) =>
    query(name).optional({ values: 'falsy' }).isISO8601().withMessage(`${name} must be a date`);

export const queryInt = (name, min, max) =>
    query(name).optional({ values: 'falsy' }).isInt({ min, max }).withMessage(
        max === undefined ? `${name} must be a whole number of at least ${min}` : `${name} must be a whole number from ${min} to ${max}`
    );
