// Verifies the leave balance against a running API: days waiting for approval
// are reported per leave type and already taken off what remains, so the
// balance shows the same number a new request is checked against; rejecting or
// cancelling gives the days back.
//
// Usage (from server/): node scripts/verify-leave-balance.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and a
// throwaway employee (annual 12, sick 30); its leaves go with it. Dates are in
// next year, so nothing in the current year is touched.

const API = process.env.API_URL || 'http://localhost:5000/api';

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

// `count` weekdays starting from the first Monday of `month` in `year`
const weekdays = (year, month, count) => {
    const day = new Date(Date.UTC(year, month - 1, 1));
    while (day.getUTCDay() !== 1) day.setUTCDate(day.getUTCDate() + 1);
    const start = day.toISOString().slice(0, 10);
    for (let left = count; ; day.setUTCDate(day.getUTCDate() + 1)) {
        if (![0, 6].includes(day.getUTCDay()) && --left === 0) break;
    }
    return [start, day.toISOString().slice(0, 10)];
};

const admin = client();
const adminLogin = await admin('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (adminLogin.status !== 200) {
    console.error('superadmin login failed:', adminLogin.status, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}

const year = new Date().getFullYear() + 1;
const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const stamp = Date.now();
const email = `lb-${stamp}@example.com`;
const created = await admin('POST', '/employees', {
    employeeId: `LB${stamp}`, firstName: 'Leave', lastName: 'Balance', email,
    position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 30000
});
const employeeId = created.body.data?._id;

let emp;
const request = (type, [startDate, endDate]) => emp('POST', '/leaves', { type, startDate, endDate, reason: 'verify-leave-balance' });
const balance = async () => (await emp('GET', `/leaves/balance?year=${year}`)).body.data || {};
const show = (b) => `used=${b?.used} pending=${b?.pending} remaining=${b?.remaining}`;

try {
    emp = client();
    await emp('POST', '/auth/login', { email, password: created.body.tempPassword });
    await emp('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: `LeaveBal${stamp}x` });

    // 1. A pending request shows as pending and is already off what remains
    const three = await request('annual', weekdays(year, 2, 3));
    let b = await balance();
    check('1 pending days counted', three.status === 201 && b.annual?.used === 0 && b.annual?.pending === 3 && b.annual?.remaining === 9,
        `create=${three.status} annual ${show(b.annual)}`);

    // 2. Approving moves them from pending to used; other types are separate
    await admin('PUT', `/leaves/${three.body.data?._id}/approve`);
    const sick = await request('sick', weekdays(year, 3, 2));
    b = await balance();
    check('2 approved vs pending, per type', b.annual?.used === 3 && b.annual?.pending === 0 && b.annual?.remaining === 9 &&
        b.sick?.used === 0 && b.sick?.pending === 2 && b.sick?.remaining === 28,
        `annual ${show(b.annual)}; sick ${show(b.sick)} (create=${sick.status})`);

    // 3. The balance shows the same number a new request is checked against
    const two = await request('annual', weekdays(year, 4, 2));
    b = await balance();
    const tooMany = await request('annual', weekdays(year, 5, b.annual?.remaining + 1));
    const stated = Number((tooMany.body.message || '').match(/You have (-?\d+) days/)?.[1]);
    check('3 balance matches the request check', two.status === 201 && b.annual?.remaining === 7 && tooMany.status === 400 && stated === b.annual?.remaining,
        `annual ${show(b.annual)}; request ${b.annual?.remaining + 1} days -> ${tooMany.status} '${tooMany.body.message || ''}'`);

    // 4. Rejecting a pending request or cancelling an approved one gives the days back
    await admin('PUT', `/leaves/${two.body.data?._id}/reject`, { reason: 'verify-leave-balance' });
    await admin('DELETE', `/leaves/${three.body.data?._id}`);
    b = await balance();
    check('4 rejected and cancelled days come back', b.annual?.used === 0 && b.annual?.pending === 0 && b.annual?.remaining === 12,
        `annual ${show(b.annual)}`);
} finally {
    if (employeeId) {
        const removed = await admin('DELETE', `/employees/${employeeId}`);
        console.log(`cleanup: delete employee ${employeeId} -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
