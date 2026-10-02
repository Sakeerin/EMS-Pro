import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Random names so stored files can't be found by guessing (they used to be timestamps)
const randomFileName = (prefix, file) => `${prefix}-${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname)}`;

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
        cb(null, randomFileName('avatar', file));
    }
});

// Configure multer for JD file upload
const jdStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/jd');
    },
    filename: (req, file, cb) => {
        cb(null, randomFileName('jd', file));
    }
});

export const uploadAvatar = multer({
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

export const uploadJD = multer({
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
