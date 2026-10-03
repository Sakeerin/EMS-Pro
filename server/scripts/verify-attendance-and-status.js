// Verifies that attendance can only be recorded for someone else by HR/admin
// roles, and that an employee's login follows their employment status.
//
// Usage (from server/): node scripts/verify-attendance-and-status.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// two throwaway employees (their attendance and accounts go with them).

const API = process.env.API_URL || 'http://localhost:5000/api';
const BAD_ID = `0x${'0'.repeat(22)}`;

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

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
        return { status: res.status, body: await res.json().catch(() => ({})) };
    };
};

const admin = client();
const adminLogin = await admin('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (adminLogin.status !== 200) {
    console.error('superadmin login failed:', adminLogin.status, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}
const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const stamp = Date.now();
const employeeIds = [];

const createEmployee = async (tag) => {
    const email = `att-${tag.toLowerCase()}-${stamp}@example.com`;
    const created = await admin('POST', '/employees', {
        employeeId: `ATT${tag}${stamp}`, firstName: 'Att', lastName: tag, email,
        position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 30000
    });
    employeeIds.push(created.body.data._id);
    const password = `Att${tag}${stamp}x`;
    const api = client();
    const login = await api('POST', '/auth/login', { email, password: created.body.tempPassword });
    await api('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: password });
    return { id: created.body.data._id, userId: login.body.data?._id, email, password, api };
};
const todayFor = async (employee) => (await employee.api('GET', '/attendance/today')).body.data || {};
const loginStatus = async (employee) => (await client()('POST', '/auth/login', { email: employee.email, password: employee.password })).status;

try {
    const a = await createEmployee('A');
    const b = await createEmployee('B');

    // 1. An employee naming someone else's id still only checks themself in
    const bForA = await b.api('POST', '/attendance/check-in', { employeeId: a.id });
    check('1 employee cannot check in a colleague', bForA.status === 201 && !(await todayFor(a)).checkIn?.time && !!(await todayFor(b)).checkIn?.time,
        `status=${bForA.status} A checked in=${!!(await todayFor(a)).checkIn?.time} B checked in=${!!(await todayFor(b)).checkIn?.time}`);

    // 2. HR/admin roles can record attendance for an employee (corrections)
    const adminForA = await admin('POST', '/attendance/check-in', { employeeId: a.id });
    check('2 HR can check in an employee', adminForA.status === 201 && !!(await todayFor(a)).checkIn?.time,
        `status=${adminForA.status} A checked in=${!!(await todayFor(a)).checkIn?.time}`);

    // 3. Same for check-out: an employee naming a colleague only checks themself out
    const bOutForA = await b.api('POST', '/attendance/check-out', { employeeId: a.id });
    check('3 employee cannot check out a colleague', bOutForA.status === 200 && !(await todayFor(a)).checkOut?.time && !!(await todayFor(b)).checkOut?.time,
        `status=${bOutForA.status} A checked out=${!!(await todayFor(a)).checkOut?.time} B checked out=${!!(await todayFor(b)).checkOut?.time}`);

    // 4. A malformed employee id from HR is a 400, not a 500
    const malformed = await admin('POST', '/attendance/check-in', { employeeId: BAD_ID });
    check('4 malformed employee id rejected', malformed.status === 400, `status=${malformed.status}`);

    // 5. Terminating an employee blocks their login and their open session
    await admin('PUT', `/employees/${a.id}`, { status: 'terminated' });
    const openSession = await a.api('GET', '/auth/me');
    const terminatedLogin = await loginStatus(a);
    check('5 terminated employee is locked out', openSession.status === 401 && terminatedLogin === 401,
        `open session=${openSession.status} new login=${terminatedLogin}`);

    // 6. Setting them back to active, then on leave, allows login again
    await admin('PUT', `/employees/${a.id}`, { status: 'active' });
    const activeLogin = await loginStatus(a);
    await admin('PUT', `/employees/${a.id}`, { status: 'on_leave' });
    const onLeaveLogin = await loginStatus(a);
    check('6 active and on-leave employees can sign in', activeLogin === 200 && onLeaveLogin === 200,
        `active=${activeLogin} on_leave=${onLeaveLogin}`);

    // 7. An edit that doesn't change the status leaves a manually deactivated account alone
    await admin('PUT', `/users/${b.userId}`, { isActive: false });
    await admin('PUT', `/employees/${b.id}`, { status: 'active', phone: '0812345678' });
    const deactivatedLogin = await loginStatus(b);
    check('7 unchanged status keeps a deactivated account off', deactivatedLogin === 401, `login=${deactivatedLogin}`);
} finally {
    for (const id of employeeIds) {
        const removed = await admin('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
