// Verifies that malformed query parameters on list endpoints get a 400 with a
// reason instead of a 500, that ?a[$op]=... can't smuggle Mongo operators into
// a filter, that the user search treats its text literally, and that the
// parameters the app really sends still work.
//
// Usage (from server/): node scripts/verify-query-params.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// dev1 accounts; it only reads.

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

const login = async (email) => {
    const api = client();
    const res = await api('POST', '/auth/login', { email, password: 'Password1' });
    if (res.status !== 200) {
        console.error(`${email} login failed:`, res.status, '(clear rl:* keys in Redis if rate limited)');
        process.exit(2);
    }
    return api;
};
const admin = await login('superadmin@company.com');
const dev1 = await login('dev1@company.com');

// Runs GETs and reports each as path=status; ok when every status is 400
const allRefused = async (api, paths) => {
    const results = [];
    for (const p of paths) results.push([p, (await api('GET', p)).status]);
    return { ok: results.every(([, s]) => s === 400), detail: results.map(([p, s]) => `${p}=${s}`).join(' ') };
};

// 1. Employees: bad department id, operator objects, repeated keys
let r = await allRefused(admin, [
    '/employees?department=abc',
    '/employees?status[$ne]=active',
    '/employees?search=a&search=b',
    '/employees/supervisors?level=officer&department=abc'
]);
check('1 employee list params', r.ok, r.detail);

// 2. Users: page/limit must be positive whole numbers, no operators
r = await allRefused(admin, [
    '/users?page=abc',
    '/users?limit=0',
    '/users?role[$ne]=employee'
]);
check('2 user list params', r.ok, r.detail);

// 3. User search is plain text, not a regular expression
const paren = await admin('GET', '/users?search=(');
const dotStar = await admin('GET', '/users?search=.*');
const exact = await admin('GET', '/users?search=dev1@company.com');
check('3 user search is literal text', paren.status === 200 && paren.body.data?.length === 0 && dotStar.status === 200 && dotStar.body.data?.length === 0 &&
    exact.body.data?.length === 1,
    `'('=${paren.status}/${paren.body.data?.length} '.*'=${dotStar.status}/${dotStar.body.data?.length} exact=${exact.body.data?.length}`);

// 4. Leaves, attendance and payroll filters
r = await allRefused(admin, [
    '/leaves?startDate=abc&endDate=abc',
    '/leaves?status[$ne]=pending',
    '/attendance/report?startDate=abc&endDate=abc',
    '/attendance/report?department=abc',
    '/attendance/report?page=abc',
    '/payroll?month=abc',
    '/payroll?month=13',
    '/payroll?year=abc',
    '/payroll?status[$ne]=draft'
]);
check('4 leave/attendance/payroll params', r.ok, r.detail);
r = await allRefused(dev1, ['/attendance/my?startDate=abc&endDate=abc']);
check('5 own attendance date filter', r.ok, r.detail);

// 6. What the app actually sends still works
const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
const valid = [
    [admin, `/employees?page=1&limit=5&search=&department=${departmentId}&status=active`],
    [admin, '/employees?page=1&limit=10&search=&department=&status='],
    [admin, `/employees/supervisors?level=officer&department=${departmentId}`],
    [admin, '/users?page=1&limit=10&search=dev1&role=&status='],
    [admin, '/leaves?status=pending'],
    [admin, '/attendance/report?startDate=2026-10-01&endDate=2026-10-31&page=1&limit=50'],
    [admin, '/attendance/overtime?status=pending'],
    [admin, '/payroll?month=9&year=2026'],
    [dev1, `/attendance/my?startDate=${encodeURIComponent(monthStart)}&endDate=${encodeURIComponent(new Date().toISOString())}`]
];
const validResults = [];
for (const [api, p] of valid) validResults.push([p, (await api('GET', p)).status]);
const payrollSep = await admin('GET', '/payroll?month=9&year=2026');
check('6 real parameters still work', validResults.every(([, s]) => s === 200),
    validResults.filter(([, s]) => s !== 200).map(([p, s]) => `${p}=${s}`).join(' ') || `all 200 (September payroll rows: ${payrollSep.body.data?.length})`);

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
