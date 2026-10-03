// Verifies leave rules against a running API: who can cancel and when, no
// self-approval, and no overlapping requests.
//
// Usage (from server/): node scripts/verify-leave-rules.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// two throwaway employees (one promoted to HR); their leaves and accounts go
// with them. Dates are in 2026, the balance year: Sep 28-29 is in the past,
// November is in the future.

const API = process.env.API_URL || 'http://localhost:5000/api';

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

const createEmployee = async (tag, role) => {
    const email = `lr-${tag.toLowerCase()}-${stamp}@example.com`;
    const created = await admin('POST', '/employees', {
        employeeId: `LR${tag}${stamp}`, firstName: 'Leave', lastName: tag, email,
        position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 30000
    });
    employeeIds.push(created.body.data._id);
    const api = client();
    const login = await api('POST', '/auth/login', { email, password: created.body.tempPassword });
    await api('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: `Leave${tag}${stamp}x` });
    if (role) await admin('PUT', `/users/${login.body.data._id}`, { role });
    return api;
};
const request = (api, startDate, endDate) =>
    api('POST', '/leaves', { type: 'annual', startDate, endDate, reason: 'verify-leave-rules' });
const statusOf = async (api, id) => ((await api('GET', '/leaves/my')).body.data || []).find(l => l._id === id)?.status;

try {
    const emp = await createEmployee('Emp');
    const hr = await createEmployee('Hr', 'hr');

    // 1. The employee can cancel a pending request
    const pending = await request(emp, '2026-11-02', '2026-11-02');
    const cancelPending = await emp('DELETE', `/leaves/${pending.body.data?._id}`);
    check('1 owner cancels pending leave', cancelPending.status === 200, `create=${pending.status} cancel=${cancelPending.status}`);

    // 2. ...and an approved one that hasn't started yet
    const future = await request(emp, '2026-11-04', '2026-11-04');
    await admin('PUT', `/leaves/${future.body.data?._id}/approve`);
    const cancelFuture = await emp('DELETE', `/leaves/${future.body.data?._id}`);
    check('2 owner cancels approved future leave', cancelFuture.status === 200, `cancel=${cancelFuture.status}`);

    // 3. ...but not approved leave that has already started, so days taken can't be refunded
    const past = await request(emp, '2026-09-28', '2026-09-29');
    const pastId = past.body.data?._id;
    await admin('PUT', `/leaves/${pastId}/approve`);
    const cancelPast = await emp('DELETE', `/leaves/${pastId}`);
    const pastState = await statusOf(emp, pastId);
    check('3 owner cannot cancel leave already taken', cancelPast.status === 403 && pastState === 'approved',
        `cancel=${cancelPast.status} state=${pastState} msg='${cancelPast.body.message || ''}'`);

    // 4. HR can still cancel it (corrections)
    const hrCancel = await hr('DELETE', `/leaves/${pastId}`);
    check('4 HR cancels started leave', hrCancel.status === 200 && (await statusOf(emp, pastId)) === 'cancelled',
        `cancel=${hrCancel.status} state=${await statusOf(emp, pastId)}`);

    // 5. HR can't approve or reject their own request; someone else can
    const own = await request(hr, '2026-11-23', '2026-11-23');
    const ownId = own.body.data?._id;
    const selfApprove = await hr('PUT', `/leaves/${ownId}/approve`);
    const selfReject = await hr('PUT', `/leaves/${ownId}/reject`, { reason: 'self' });
    const otherApprove = await admin('PUT', `/leaves/${ownId}/approve`);
    check('5 no self-approval', selfApprove.status === 403 && selfReject.status === 403 && otherApprove.status === 200,
        `self approve=${selfApprove.status} self reject=${selfReject.status} superadmin approve=${otherApprove.status}`);

    // 6. Overlapping requests are refused; adjacent ones and ones replacing a cancelled request are fine
    const first = await request(emp, '2026-11-16', '2026-11-18');
    const overlap = await request(emp, '2026-11-17', '2026-11-19');
    const adjacent = await request(emp, '2026-11-19', '2026-11-20');
    await emp('DELETE', `/leaves/${first.body.data?._id}`);
    const replacement = await request(emp, '2026-11-16', '2026-11-18');
    check('6 overlapping requests refused', first.status === 201 && overlap.status === 400 && adjacent.status === 201 && replacement.status === 201,
        `first=${first.status} overlap=${overlap.status} adjacent=${adjacent.status} after cancel=${replacement.status} msg='${overlap.body.message || ''}'`);
} finally {
    for (const id of employeeIds) {
        const removed = await admin('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
