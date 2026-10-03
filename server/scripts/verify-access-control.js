// Verifies who can read employee records and leave requests, and that
// self-registration is closed, against a running API.
//
// Usage (from server/): node scripts/verify-access-control.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// creates throwaway employees and a profile-less account, all removed at the
// end (accounts without an employee through MongoDB, since the API only
// deactivates users).

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API = process.env.API_URL || 'http://localhost:5000/api';
const BAD_ID = `0x${'0'.repeat(22)}`;

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

const client = () => {
    let cookie = '';
    return async (method, apiPath, body) => {
        const res = await fetch(API + apiPath, {
            method,
            headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
            body: body ? JSON.stringify(body) : undefined
        });
        const token = res.headers.getSetCookie().find(c => c.startsWith('token='));
        if (token) cookie = token.split(';')[0];
        return { status: res.status, body: await res.json().catch(() => ({})) };
    };
};

// New accounts must replace their temporary password before using the API
const signInFresh = async (email, tempPassword, newPassword) => {
    const c = client();
    const login = await c('POST', '/auth/login', { email, password: tempPassword });
    if (login.status !== 200) throw new Error(`login ${email}: ${login.status}`);
    await c('PUT', '/auth/password', { currentPassword: tempPassword, newPassword });
    return c;
};

const stamp = Date.now();
const admin = client();
const adminLogin = await admin('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (adminLogin.status !== 200) {
    console.error('superadmin login failed:', adminLogin.status, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}
const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const employeeIds = [];
const throwawayEmails = [`acl-noprofile-${stamp}@example.com`, `acl-register-${stamp}@example.com`];

const createEmployee = async (tag) => {
    const res = await admin('POST', '/employees', {
        employeeId: `ACL${tag}${stamp}`, firstName: 'Acl', lastName: tag, email: `acl-${tag.toLowerCase()}-${stamp}@example.com`,
        position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 45000
    });
    employeeIds.push(res.body.data._id);
    return { id: res.body.data._id, api: await signInFresh(res.body.data.email, res.body.tempPassword, `Acl${tag}${stamp}x`) };
};

try {
    const a = await createEmployee('A');
    const b = await createEmployee('B');

    // 1. An employee can't list employees or read company stats
    const list = await a.api('GET', '/employees');
    const stats = await a.api('GET', '/employees/stats/overview');
    check('1 employee cannot list employees or stats', list.status === 403 && stats.status === 403,
        `list=${list.status} stats=${stats.status}`);

    // 2. An employee can read their own record but not a colleague's
    const own = await a.api('GET', `/employees/${a.id}`);
    const colleague = await b.api('GET', `/employees/${a.id}`);
    check('2 own record only', own.status === 200 && own.body.data?._id === a.id && colleague.status === 403,
        `own=${own.status} colleague=${colleague.status}${colleague.body.data?.salary ? ' (salary exposed)' : ''}`);

    // 3. A malformed id is a 400
    const malformed = await a.api('GET', `/employees/${BAD_ID}`);
    check('3 malformed employee id rejected', malformed.status === 400, `status=${malformed.status}`);

    // 4. HR roles get at most 100 employees per page
    const big = await admin('GET', '/employees?limit=1000');
    check('4 list page size capped at 100', big.status === 200 && (big.body.data?.length || 0) <= 100,
        `status=${big.status} returned=${big.body.data?.length}`);

    // 5. Self-registration is closed
    const register = await client()('POST', '/auth/register', { email: throwawayEmails[1], password: `Register${stamp}x` });
    check('5 self-registration closed', register.status === 404, `status=${register.status}`);

    // 6. An account without an employee profile sees no one's leave requests
    await a.api('POST', '/leaves', { type: 'annual', startDate: '2026-11-11', endDate: '2026-11-11', reason: 'verify-access-control' });
    await admin('POST', '/users', { email: throwawayEmails[0], password: `Temp${stamp}aA1`, role: 'employee' });
    const noProfile = await signInFresh(throwawayEmails[0], `Temp${stamp}aA1`, `NoProfile${stamp}aA1`);
    const leaves = await noProfile('GET', '/leaves');
    check('6 profile-less account sees no leave requests', leaves.status !== 200 || (leaves.body.data || []).length === 0,
        `status=${leaves.status} leaves visible=${(leaves.body.data || []).length}`);
} finally {
    for (const id of employeeIds) {
        const removed = await admin('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    const { deletedCount } = await mongoose.connection.db.collection('users').deleteMany({ email: { $in: throwawayEmails } });
    await mongoose.disconnect();
    console.log(`cleanup: ${deletedCount} account(s) without an employee removed`);
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
