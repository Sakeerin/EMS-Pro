// Verifies that employee create/update accept blank optional fields the way
// the Add/Edit Employee form sends them ('' for "not selected").
//
// Usage (from server/): node scripts/verify-employee-optional-fields.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin
// from scripts/seed.js (1 login).

const API = process.env.API_URL || 'http://localhost:5000/api';

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
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
};

const login = await api('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (login.status !== 200) {
    console.error('superadmin login failed:', login.status, login.body.message, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}

const departmentId = (await api('GET', '/departments')).body.data?.[0]?._id;
const someManagerId = (await api('GET', '/employees?limit=1')).body.data?.[0]?._id;
if (!departmentId || !someManagerId) {
    console.error('missing seed data; run npm run seed first');
    process.exit(2);
}

const stamp = Date.now();
const createdIds = [];
let employeeId;

try {
    // 1. Create with the blank optional fields the form sends
    const created = await api('POST', '/employees', {
        employeeId: `OPT${stamp}`, firstName: 'Optional', lastName: 'Fields', email: `opt${stamp}@example.com`,
        phone: '', position: 'Tester', employeeLevel: 'officer', department: departmentId,
        manager: '', gender: '', dateOfBirth: '', hireDate: '2026-10-02', salary: '30000', status: 'active'
    });
    if (created.body.data?._id) createdIds.push(created.body.data._id);
    check('1 create with blank manager/gender', created.status === 201, `status=${created.status} msg='${created.body.message || ''}'`);

    // Edits run on an employee created without the optional keys, so they don't depend on check 1
    const base = await api('POST', '/employees', {
        employeeId: `OPTB${stamp}`, firstName: 'Optional', lastName: 'Edit', email: `optb${stamp}@example.com`,
        position: 'Tester', department: departmentId, hireDate: '2026-10-02', salary: 30000
    });
    employeeId = base.body.data?._id;
    if (employeeId) createdIds.push(employeeId);

    if (employeeId) {
        // 2. Edit round trip exactly as EmployeeForm's fetchEmployee builds it
        const emp = (await api('GET', `/employees/${employeeId}`)).body.data;
        const editPayload = {
            ...emp,
            department: emp.department?._id || '',
            manager: emp.manager?._id || '',
            employeeLevel: emp.employeeLevel || 'officer',
            hireDate: emp.hireDate?.split('T')[0] || '',
            dateOfBirth: emp.dateOfBirth?.split('T')[0] || '',
            gender: emp.gender || ''
        };
        const edited = await api('PUT', `/employees/${employeeId}`, editPayload);
        check('2 edit round trip with no manager', edited.status === 200, `status=${edited.status} msg='${edited.body.message || ''}'`);

        // 3. Setting a manager and gender, then clearing them back to blank
        const set = await api('PUT', `/employees/${employeeId}`, { manager: someManagerId, gender: 'female' });
        const cleared = await api('PUT', `/employees/${employeeId}`, { manager: '', gender: '' });
        const after = (await api('GET', `/employees/${employeeId}`)).body.data;
        check('3 clear manager and gender',
            set.status === 200 && cleared.status === 200 && !after?.manager && !after?.gender,
            `set=${set.status} clear=${cleared.status} manager=${JSON.stringify(after?.manager ?? null)} gender=${JSON.stringify(after?.gender ?? null)}`);
    } else {
        check('2 edit round trip with no manager', false, `skipped: base create failed (${base.status})`);
        check('3 clear manager and gender', false, `skipped: base create failed (${base.status})`);
    }

    // 4. Invalid values are still rejected (not silently accepted)
    const badGender = await api('POST', '/employees', {
        employeeId: `OPTX${stamp}`, firstName: 'Bad', lastName: 'Gender', email: `optx${stamp}@example.com`,
        position: 'Tester', department: departmentId, gender: 'robot', hireDate: '2026-10-02', salary: 30000
    });
    if (badGender.body.data?._id) createdIds.push(badGender.body.data._id);
    check('4 invalid gender still rejected', badGender.status >= 400, `status=${badGender.status}`);
} finally {
    for (const id of createdIds) {
        const removed = await api('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete test employee ${id} -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
