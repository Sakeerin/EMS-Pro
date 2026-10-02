// Verifies that the cached dashboard stats are dropped after successful writes
// and kept after failed ones.
//
// Usage (from server/): node scripts/verify-dashboard-cache.js
// API_URL defaults to http://localhost:5000/api. Needs Redis running (without
// it nothing is cached) and the seed superadmin from scripts/seed.js (1 login).

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

const stats = async () => {
    const res = await api('GET', '/dashboard/stats');
    return { cached: res.body.cached === true, total: res.body.data?.employees?.total };
};

const login = await api('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (login.status !== 200) {
    console.error('superadmin login failed:', login.status, login.body.message, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}
const departmentId = (await api('GET', '/departments')).body.data?.[0]?._id;

const stamp = Date.now();
let employeeId;

try {
    // 1. Stats are cached on the second read
    await stats();
    const warm = await stats();
    check('1 stats cached on second read', warm.cached, `cached=${warm.cached} total=${warm.total}`);

    // 2. A successful create drops the cache, so the new employee shows at once
    const created = await api('POST', '/employees', {
        employeeId: `DSH${stamp}`, firstName: 'Dash', lastName: 'Board', email: `dsh${stamp}@example.com`,
        position: 'Tester', department: departmentId, hireDate: '2026-10-02', salary: 30000
    });
    employeeId = created.body.data?._id;
    const afterCreate = await stats();
    check('2 create refreshes stats', created.status === 201 && !afterCreate.cached && afterCreate.total === warm.total + 1,
        `create=${created.status} cached=${afterCreate.cached} total=${afterCreate.total} (was ${warm.total})`);

    // 3. A failed write leaves the cache alone
    await stats();
    const rejected = await api('POST', '/employees', { firstName: 'Missing fields' });
    const afterRejected = await stats();
    check('3 failed write keeps cache', rejected.status === 400 && afterRejected.cached,
        `write=${rejected.status} cached=${afterRejected.cached}`);

    // 4. A successful delete drops the cache again
    const removed = employeeId ? await api('DELETE', `/employees/${employeeId}`) : { status: 0 };
    if (removed.status === 200) employeeId = null;
    const afterDelete = await stats();
    check('4 delete refreshes stats', removed.status === 200 && !afterDelete.cached && afterDelete.total === warm.total,
        `delete=${removed.status} cached=${afterDelete.cached} total=${afterDelete.total} (expected ${warm.total})`);
} finally {
    if (employeeId) {
        const removed = await api('DELETE', `/employees/${employeeId}`);
        console.log(`cleanup: delete test employee -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
