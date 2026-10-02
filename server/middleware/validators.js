import { param } from 'express-validator';

// A plain 24-hex ObjectId. express-validator's isMongoId() also accepts
// 0x-prefixed strings that Mongoose can't cast, which surfaced as 500s
export const objectIdParam = (name, message) => param(name).matches(/^[0-9a-fA-F]{24}$/).withMessage(message);
