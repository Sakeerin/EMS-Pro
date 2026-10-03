// Verifies the employee list search against a running API: part of a name,
// email or employee ID finds the employee, in any letter case; several words
// must all match (in any order); the text is matched literally; and the
// department/status filters still apply.
//
// Usage (from server/): node scripts/verify-employee-search.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// two throwaway employees with unusual names, removed at the end.

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

const admin = client();
const adminLogin = await admin('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (adminLogin.status !== 200) {
    console.error('superadmin login failed:', adminLogin.status, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}

const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const stamp = Date.now();
const employeeIds = [];
const create = async (firstName, lastName, tag) => {
    const res = await admin('POST', '/employees', {
        employeeId: `ZQ${tag}${stamp}`, firstName, lastName, email: `zq-${tag.toLowerCase()}-${stamp}@example.com`,
        position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 30000
    });
    employeeIds.push(res.body.data?._id);
    return res.body.data;
};

// Employee IDs found by a search (plus the reported total)
const search = async (text, extra = '') => {
    const res = await admin('GET', `/employees?limit=100&search=${encodeURIComponent(text)}${extra}`);
    return { status: res.status, ids: (res.body.data || []).map(e => e.employeeId), total: res.body.pagination?.total };
};
const show = (r) => `${r.status}:${r.ids?.length ?? '-'}`;

try {
    const a = await create('Zephyrine', 'Quillfeather', 'A');
    const b = await create('Zephyrine', 'Brightwater', 'B');

    // 1. Part of a first or last name, any case
    const prefix = await search('Zephy');
    const middle = await search('phyri');
    const upper = await search('QUILL');
    check('1 part of a name, any case', prefix.ids.length === 2 && middle.ids.length === 2 && upper.ids.length === 1 && upper.ids[0] === a.employeeId,
        `'Zephy'=${show(prefix)} 'phyri'=${show(middle)} 'QUILL'=${show(upper)}`);

    // 2. Part of an employee ID or email
    const idPart = await search(a.employeeId.slice(0, -3));
    const emailPart = await search(`zq-b-${String(stamp).slice(0, 6)}`);
    check('2 part of an ID or email', idPart.ids.includes(a.employeeId) && emailPart.ids.length === 1 && emailPart.ids[0] === b.employeeId,
        `id part=${show(idPart)} email part=${show(emailPart)}`);

    // 3. Several words must all match, in any order
    const both = await search('Zephy Quill');
    const reversed = await search('quill zephy');
    const full = await search('Zephyrine Brightwater');
    check('3 every word must match', both.ids.length === 1 && both.ids[0] === a.employeeId && reversed.ids.length === 1 &&
        full.ids.length === 1 && full.ids[0] === b.employeeId,
        `'Zephy Quill'=${show(both)} 'quill zephy'=${show(reversed)} 'Zephyrine Brightwater'=${show(full)}`);

    // 4. The text is literal: regex characters neither break nor widen the search
    const dotStar = await search('Zephy.*');
    const paren = await search('(');
    const noMatch = await search('Zephyx');
    check('4 literal text', dotStar.status === 200 && dotStar.ids.length === 0 && paren.status === 200 && paren.ids.length === 0 && noMatch.ids.length === 0,
        `'Zephy.*'=${show(dotStar)} '('=${show(paren)} 'Zephyx'=${show(noMatch)}`);

    // 5. Filters and pagination still apply
    const active = await search('Zephy', '&status=active');
    const inactive = await search('Zephy', '&status=inactive');
    const paged = await admin('GET', `/employees?limit=1&search=Zephy`);
    check('5 filters and totals', active.ids.length === 2 && inactive.ids.length === 0 && paged.body.data?.length === 1 && paged.body.pagination?.total === 2,
        `active=${show(active)} inactive=${show(inactive)} page of 1: rows=${paged.body.data?.length} total=${paged.body.pagination?.total}`);
} finally {
    for (const id of employeeIds.filter(Boolean)) {
        const removed = await admin('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
