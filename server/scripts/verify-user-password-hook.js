// Verifies the User model's password hashing hook directly against MongoDB:
// saves that don't change the password must leave the hash alone.
//
// Usage (from server/): node scripts/verify-user-password-hook.js
// Uses its own throwaway database (VERIFY_MONGODB_URI, default below) and drops
// it at the end. It refuses to run on a database not named ems_verify_*.

import mongoose from 'mongoose';
import User from '../models/User.js';

const uri = process.env.VERIFY_MONGODB_URI || 'mongodb://localhost:27017/ems_verify_user_hook?replicaSet=rs0';
const PASSWORD = 'Verify1234';

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

await mongoose.connect(uri);
const dbName = mongoose.connection.db.databaseName;
if (!dbName.startsWith('ems_verify_')) {
    console.error(`refusing to run on database "${dbName}": name must start with ems_verify_`);
    await mongoose.disconnect();
    process.exit(2);
}

const unhandled = [];
process.on('unhandledRejection', (err) => unhandled.push(err.message));
// Lets a stray async hash started by the hook finish before we look
const settle = () => new Promise((resolve) => setTimeout(resolve, 1000));

try {
    await User.init();
    const created = await User.create({ email: 'hook@example.com', password: PASSWORD });
    const storedHash = async () => (await User.collection.findOne({ _id: created._id })).password;
    const originalHash = await storedHash();

    // 1. Saving a user loaded with its password, without changing it (login's lastLogin save)
    const loaded = await User.findById(created._id).select('+password');
    const loadedHash = loaded.password;
    loaded.lastLogin = new Date();
    await loaded.save({ validateBeforeSave: false });
    await settle();
    check('1 unchanged password keeps its hash', (await storedHash()) === originalHash && loaded.password === loadedHash,
        `stored same=${(await storedHash()) === originalHash} in-memory same=${loaded.password === loadedHash}`);

    // 2. Saving that same document again must not lock the user out
    loaded.lastLogin = new Date();
    await loaded.save({ validateBeforeSave: false });
    await settle();
    const afterSecondSave = await User.findById(created._id).select('+password');
    check('2 second save keeps the password valid', await afterSecondSave.matchPassword(PASSWORD),
        `matches=${await afterSecondSave.matchPassword(PASSWORD)}`);

    // 3. Saving a user loaded without its password (e.g. toggling isActive)
    const withoutPassword = await User.findById(created._id);
    withoutPassword.isActive = false;
    let saveError = null;
    try { await withoutPassword.save(); } catch (err) { saveError = err.message; }
    await settle();
    check('3 save without password field works', !saveError && (await storedHash()) === originalHash,
        `error=${saveError} hash same=${(await storedHash()) === originalHash}`);

    // 4. Changing the password still hashes it, once
    const changing = await User.findById(created._id).select('+password');
    changing.password = 'Changed5678';
    await changing.save();
    const afterChange = await User.findById(created._id).select('+password');
    check('4 new password is hashed once', afterChange.password !== 'Changed5678' && await afterChange.matchPassword('Changed5678'),
        `plaintext stored=${afterChange.password === 'Changed5678'} matches=${await afterChange.matchPassword('Changed5678')}`);

    check('5 no unhandled rejections', unhandled.length === 0, `unhandled=${JSON.stringify(unhandled)}`);
} finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
