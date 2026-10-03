// Creates a SuperAdmin directly in MongoDB, e.g. the first one on a new
// install, since accounts can't be self-registered. Prints a temporary password
// (so no password ends up in shell history); it must be changed at first sign-in.
//
// Usage (from server/): npm run create-superadmin -- you@example.com

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error('Usage: npm run create-superadmin -- <email>');
    process.exit(2);
}

await mongoose.connect(process.env.MONGODB_URI);
try {
    if (await User.exists({ email })) {
        console.error(`An account with ${email} already exists. Change its role on the Users page instead.`);
        process.exitCode = 1;
    } else {
        const tempPassword = User.generateTempPassword();
        await User.create({ email, password: tempPassword, role: 'superadmin', mustChangePassword: true });
        console.log(`SuperAdmin ${email} created.`);
        console.log(`Temporary password: ${tempPassword}`);
        console.log('Sign in with it; you will be asked to choose a new password.');
    }
} finally {
    await mongoose.disconnect();
}
