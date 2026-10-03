// Verifies the leave request flow against a running API with a throwaway
// employee: create, weekend-only and over-balance rejections, approve,
// reject and cancel, and the balance after approval.
//
// Usage (from server/): node scripts/verify-leave-requests.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin from
// scripts/seed.js (2 logins in total). Dates are weeks ahead of today within
// one calendar year (scripts/lib/leaveTestDates.js).

import { futureDay } from './lib/leaveTestDates.js';

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

const stamp = Date.now();
const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const created = await admin('POST', '/employees', {
    employeeId: `LV${stamp}`, firstName: 'Leave', lastName: 'Tester', email: `lv${stamp}@example.com`,
    position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 30000
});
const employeeId = created.body.data?._id;
if (!employeeId) {
    console.error('could not create test employee:', created.status, created.body.message);
    process.exit(2);
}

try {
    // Sign in as the new employee and replace the temporary password
    const emp = client();
    await emp('POST', '/auth/login', { email: `lv${stamp}@example.com`, password: created.body.tempPassword });
    await emp('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: `Leave${stamp}x` });

    const request = (type, startDate, endDate) =>
        emp('POST', '/leaves', { type, startDate, endDate, reason: 'verify-leave-requests' });

    // 1. A Friday-to-Monday request is created and counts 2 business days
    const friToMon = await request('annual', futureDay(0, 4), futureDay(1, 0));
    check('1 create leave request', friToMon.status === 201 && friToMon.body.data?.days === 2 && friToMon.body.data?.status === 'pending',
        `status=${friToMon.status} days=${friToMon.body.data?.days} state=${friToMon.body.data?.status} msg='${friToMon.body.message || ''}'`);

    // 2. A weekend-only request is rejected (a weekend clear of the request
    //    above, so it isn't refused as an overlap instead)
    const weekend = await request('annual', futureDay(2, 5), futureDay(2, 6));
    check('2 weekend-only request rejected', weekend.status === 400 && /business day/i.test(weekend.body.message || ''),
        `status=${weekend.status} msg='${weekend.body.message || ''}'`);

    // 3. More days than the remaining balance (12 annual - 2 pending = 10) is
    //    rejected: Monday of one week to Wednesday two weeks later is 13 days
    const tooLong = await request('annual', futureDay(3, 0), futureDay(5, 2));
    check('3 over-balance request rejected', tooLong.status === 400 && /Insufficient annual leave balance/.test(tooLong.body.message || ''),
        `status=${tooLong.status} msg='${tooLong.body.message || ''}'`);

    // 4. Approving it, then the balance shows 2 annual days used
    const leaveId = friToMon.body.data?._id;
    const approved = leaveId ? await admin('PUT', `/leaves/${leaveId}/approve`) : { status: 0, body: {} };
    const balance = (await emp('GET', `/leaves/balance?year=${futureDay(0, 0).slice(0, 4)}`)).body.data;
    check('4 approve updates balance', approved.status === 200 && approved.body.data?.status === 'approved'
        && balance?.annual?.used === 2 && balance?.annual?.remaining === 10,
        `approve=${approved.status} state=${approved.body.data?.status} annual used=${balance?.annual?.used} remaining=${balance?.annual?.remaining}`);

    // 5. Rejecting a request
    const sick = await request('sick', futureDay(1, 1), futureDay(1, 1));
    const rejected = sick.body.data?._id
        ? await admin('PUT', `/leaves/${sick.body.data._id}/reject`, { reason: 'verify-leave-requests' })
        : { status: 0, body: {} };
    check('5 reject request', sick.status === 201 && rejected.status === 200 && rejected.body.data?.status === 'rejected',
        `create=${sick.status} reject=${rejected.status} state=${rejected.body.data?.status}`);

    // 6. The employee cancelling their own pending request
    const personal = await request('personal', futureDay(1, 2), futureDay(1, 2));
    const cancelled = personal.body.data?._id
        ? await emp('DELETE', `/leaves/${personal.body.data._id}`)
        : { status: 0, body: {} };
    const mine = (await emp('GET', '/leaves/my')).body.data || [];
    const cancelledState = mine.find(l => l._id === personal.body.data?._id)?.status;
    check('6 cancel own request', personal.status === 201 && cancelled.status === 200 && cancelledState === 'cancelled',
        `create=${personal.status} cancel=${cancelled.status} state=${cancelledState}`);
} finally {
    // Deleting the employee also deletes their leave requests
    const removed = await admin('DELETE', `/employees/${employeeId}`);
    console.log(`cleanup: delete test employee -> ${removed.status}`);
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
