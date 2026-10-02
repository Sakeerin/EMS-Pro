// Verifies the temporary-password flow against a running API:
// create employee -> one-time password -> forced change -> superadmin reset.
//
// Usage (from server/): node scripts/verify-temp-password.js
// API_URL defaults to http://localhost:5000/api. Uses the seed accounts from
// scripts/seed.js and makes exactly 5 logins, the login rate limit per 15
// minutes, so clear the rl:* keys in Redis before running it again sooner.

const API = process.env.API_URL || 'http://localhost:5000/api';
const SEED_PASSWORD = 'Password1';
const SAME_PASSWORD_MESSAGE = 'New password must be different from the current password';

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

// Minimal HTTP client that keeps the auth cookie between calls
const client = () => {
    let cookie = '';
    return async (method, path, body) => {
        const res = await fetch(API + path, {
            method,
            headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
            body: body ? JSON.stringify(body) : undefined
        });
        const token = res.headers.getSetCookie().find(c => c.startsWith('token='));
        if (token) cookie = token.split(';')[0];
        const json = await res.json().catch(() => ({}));
        return { status: res.status, body: json };
    };
};

const login = async (email, password) => {
    const api = client();
    const res = await api('POST', '/auth/login', { email, password });
    if (res.status === 429) {
        console.error('Rate limited on login: clear the rl:* keys in Redis or wait 15 minutes');
        process.exit(2);
    }
    return { api, res };
};

const { api: admin, res: adminLogin } = await login('superadmin@company.com', SEED_PASSWORD);
if (adminLogin.status !== 200) {
    console.error('superadmin login failed:', adminLogin.status, adminLogin.body.message);
    process.exit(2);
}
const superadminId = adminLogin.body.data._id;

const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
if (!departmentId) {
    console.error('no department found; run npm run seed first');
    process.exit(2);
}

const stamp = Date.now();
const email = `tmp${stamp}@example.com`;
let employeeId;

try {
    // 1. Creating an employee returns the one-time password
    const created = await admin('POST', '/employees', {
        employeeId: `TMP${stamp}`, firstName: 'Temp', lastName: 'Password', email,
        department: departmentId, position: 'Tester', hireDate: '2026-10-01', salary: 30000
    });
    employeeId = created.body.data?._id;
    const temp1 = created.body.tempPassword;
    check('1 create returns tempPassword', created.status === 201 && typeof temp1 === 'string' && temp1.length >= 8,
        `status=${created.status} tempPassword=${temp1 ? 'present' : 'missing'}`);

    // 2. The employee can log in with it
    const { api: emp, res: empLogin } = await login(email, temp1 || 'missing');
    check('2 login with tempPassword', empLogin.status === 200, `status=${empLogin.status}`);
    const empUserId = empLogin.body.data?._id;

    // 3. Everything except me/password/logout is blocked until the change
    const blocked = await emp('GET', '/attendance/today');
    const me = await emp('GET', '/auth/me');
    check('3 other APIs blocked until change',
        blocked.status === 403 && blocked.body.code === 'PASSWORD_CHANGE_REQUIRED' && me.status === 200,
        `attendance=${blocked.status}/${blocked.body.code} me=${me.status}`);

    // 4. Changing to the same password is rejected
    const same = await emp('PUT', '/auth/password', { currentPassword: temp1, newPassword: temp1 });
    check('4 same password rejected',
        same.status === 400 && (same.body.errors || []).some(e => e.message === SAME_PASSWORD_MESSAGE),
        `status=${same.status} errors=${JSON.stringify((same.body.errors || []).map(e => e.message))}`);

    // 5. A real change clears the flag and unblocks the API
    const newPassword = `Changed${stamp}a`;
    const changed = await emp('PUT', '/auth/password', { currentPassword: temp1, newPassword });
    const unblocked = await emp('GET', '/attendance/today');
    const meAfter = await emp('GET', '/auth/me');
    check('5 change unblocks',
        changed.status === 200 && unblocked.status === 200 && meAfter.body.data?.mustChangePassword === false,
        `change=${changed.status} attendance=${unblocked.status} flag=${meAfter.body.data?.mustChangePassword}`);

    // 6. Superadmin reset: old password stops working, new one works and is flagged
    const reset = await admin('POST', `/users/${empUserId}/reset-password`);
    const temp2 = reset.body.data?.tempPassword;
    const { res: oldLogin } = await login(email, newPassword);
    const { api: emp2, res: tempLogin } = await login(email, temp2 || 'missing');
    const flagged = await emp2('GET', '/auth/me');
    check('6 superadmin reset',
        reset.status === 200 && !!temp2 && oldLogin.status === 401 && tempLogin.status === 200
            && flagged.body.data?.mustChangePassword === true,
        `reset=${reset.status} old=${oldLogin.status} temp=${tempLogin.status} flag=${flagged.body.data?.mustChangePassword}`);

    // 7. Superadmin cannot reset their own account here
    const own = await admin('POST', `/users/${superadminId}/reset-password`);
    check('7 own account rejected', own.status === 400, `status=${own.status} msg='${own.body.message}'`);

    // 8. Malformed and unknown ids are client errors, not 500s
    const malformed = await admin('POST', '/users/not-an-id/reset-password');
    const unknown = await admin('POST', '/users/000000000000000000000000/reset-password');
    check('8 malformed and unknown ids', malformed.status === 400 && unknown.status === 404,
        `malformed=${malformed.status} unknown=${unknown.status}`);

    // 9. Only superadmin may reset
    const { api: hr } = await login('hr@company.com', SEED_PASSWORD);
    const hrReset = await hr('POST', `/users/${empUserId}/reset-password`);
    check('9 non-superadmin rejected', hrReset.status === 403, `status=${hrReset.status}`);
} finally {
    if (employeeId) {
        const removed = await admin('DELETE', `/employees/${employeeId}`);
        console.log(`cleanup: delete test employee -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
