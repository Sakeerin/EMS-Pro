// Verifies that the employee and department forms get 400s with a specific
// reason for invalid or duplicate data, instead of a generic 500.
//
// Usage (from server/): node scripts/verify-write-errors.js
// API_URL defaults to http://localhost:5000/api. Needs the demo data from
// npm run seed (existing employees and departments to collide with). Creates
// one throwaway employee, removed at the end; failed writes change nothing.

const API = process.env.API_URL || 'http://localhost:5000/api';
const BAD_ID = `0x${'0'.repeat(22)}`;

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

let cookie = '';
const api = async (method, path, body) => {
    const res = await fetch(API + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
        body: body ? JSON.stringify(body) : undefined
    });
    const token = res.headers.getSetCookie().find(c => c.startsWith('token='));
    if (token) cookie = token.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const is400 = (res, pattern) => res.status === 400 && pattern.test(res.body.message || '');
const show = (res) => `status=${res.status} msg='${res.body.message || ''}'`;

const login = await api('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (login.status !== 200) {
    console.error('superadmin login failed:', login.status, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}
const existing = (await api('GET', '/employees?limit=1')).body.data?.[0];
const [deptA, deptB] = (await api('GET', '/departments')).body.data || [];
if (!existing || !deptA || !deptB) {
    console.error('needs seed data (employees and two departments)');
    process.exit(2);
}

const stamp = Date.now();
const newEmployee = (overrides) => ({
    employeeId: `ERR${stamp}`, firstName: 'Error', lastName: 'Check', email: `err${stamp}@example.com`,
    position: 'Tester', department: deptA._id, hireDate: '2026-01-05', salary: 30000, ...overrides
});
let throwawayId;

try {
    // 1. An invalid enum value names the field
    const badGender = await api('POST', '/employees', newEmployee({ gender: 'robot' }));
    check('1 invalid gender on create', is400(badGender, /gender/i), show(badGender));

    // 2. A duplicate employee ID says so (it used to claim the email existed)
    const dupId = await api('POST', '/employees', newEmployee({ employeeId: existing.employeeId }));
    check('2 duplicate employee ID on create', is400(dupId, /employee ID already exists/i), show(dupId));

    // 3. A duplicate email says so
    const dupEmail = await api('POST', '/employees', newEmployee({ email: existing.email }));
    check('3 duplicate email on create', is400(dupEmail, /email already exists/i), show(dupEmail));

    // Edits run on a throwaway employee
    const created = await api('POST', '/employees', newEmployee({}));
    throwawayId = created.body.data?._id;

    // 4. Editing to another employee's email is a 400
    const editDupEmail = await api('PUT', `/employees/${throwawayId}`, { email: existing.email });
    check('4 duplicate email on edit', is400(editDupEmail, /email already exists/i), show(editDupEmail));

    // 5. Editing to an invalid enum value is a 400
    const editBadStatus = await api('PUT', `/employees/${throwawayId}`, { status: 'robot' });
    check('5 invalid status on edit', is400(editBadStatus, /status/i), show(editBadStatus));

    // 6. A duplicate department code names the code
    const dupCode = await api('POST', '/departments', { name: `Err Dept ${stamp}`, code: deptA.code });
    check('6 duplicate department code on create', is400(dupCode, /department code already exists/i), show(dupCode));

    // 7. Renaming a department to an existing name is a 400 (it used to leak the raw E11000 error)
    const dupName = await api('PUT', `/departments/${deptB._id}`, { name: deptA.name });
    check('7 duplicate department name on edit', is400(dupName, /department name already exists/i) && !/E11000/.test(dupName.body.message || ''),
        show(dupName));

    // 8. A malformed department id is a 400
    const badDeptId = await api('PUT', `/departments/${BAD_ID}`, { description: 'x' });
    check('8 malformed department id', is400(badDeptId, /invalid/i), show(badDeptId));

    // The failed department edit must not have changed anything
    const deptBAfter = (await api('GET', `/departments/${deptB._id}`)).body.data;
    check('9 failed edit left the department unchanged', deptBAfter?.name === deptB.name, `name='${deptBAfter?.name}' (was '${deptB.name}')`);
} finally {
    if (throwawayId) {
        const removed = await api('DELETE', `/employees/${throwawayId}`);
        console.log(`cleanup: delete throwaway employee -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
