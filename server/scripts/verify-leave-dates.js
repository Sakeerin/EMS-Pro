// Verifies leave dates and yearly quotas against a running API: each request is
// checked against the quota of its own year, 31 December counts, requests can't
// span two calendar years or fall outside last year..next year, dates are plain
// YYYY-MM-DD, and a huge range is refused straight away.
//
// Usage (from server/): node scripts/verify-leave-dates.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and two
// throwaway employees (annual quota 12, personal 5); their leaves go with them.
// Dates are worked out from the current year.

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

// `count` weekdays (Mon-Fri) starting from the first Monday of `month` (1-12), plus
// `weeks` weeks, as YYYY-MM-DD strings
const weekdays = (year, month, count, weeks = 0) => {
    const day = new Date(Date.UTC(year, month - 1, 1));
    while (day.getUTCDay() !== 1) day.setUTCDate(day.getUTCDate() + 1);
    day.setUTCDate(day.getUTCDate() + weeks * 7);
    const start = day.toISOString().slice(0, 10);
    let left = count;
    while (true) {
        const dow = day.getUTCDay();
        if (dow !== 0 && dow !== 6 && --left === 0) break;
        day.setUTCDate(day.getUTCDate() + 1);
    }
    return [start, day.toISOString().slice(0, 10)];
};
const isWeekday = (iso) => ![0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

const admin = client();
const adminLogin = await admin('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (adminLogin.status !== 200) {
    console.error('superadmin login failed:', adminLogin.status, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}

const Y = new Date().getFullYear();
const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const stamp = Date.now();
const employeeIds = [];

const createEmployee = async (tag) => {
    const email = `ld-${tag.toLowerCase()}-${stamp}@example.com`;
    const created = await admin('POST', '/employees', {
        employeeId: `LD${tag}${stamp}`, firstName: 'Leave', lastName: tag, email,
        position: 'Tester', department: departmentId, hireDate: `${Y - 2}-01-05`, salary: 30000
    });
    employeeIds.push(created.body.data._id);
    const api = client();
    await api('POST', '/auth/login', { email, password: created.body.tempPassword });
    await api('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: `LeaveDates${tag}${stamp}x` });
    return api;
};

let emp;
const request = (type, [startDate, endDate]) => emp('POST', '/leaves', { type, startDate, endDate, reason: 'verify-leave-dates' });

try {
    emp = await createEmployee('Emp');

    // 1. Each request uses its own year's quota: 10 annual days this year leave the
    //    whole of next year's 12, and next year's quota is enforced on its own
    const thisYear = await request('annual', weekdays(Y, 3, 10));
    const nextJan = await request('annual', weekdays(Y + 1, 1, 5));
    const nextFeb = await request('annual', weekdays(Y + 1, 2, 5));
    const nextMar = await request('annual', weekdays(Y + 1, 3, 3));
    check('1 quota of the request year', thisYear.status === 201 && nextJan.status === 201 && nextFeb.status === 201 && nextMar.status === 400,
        `${Y} 10 days=${thisYear.status} ${Y + 1} 5=${nextJan.status} +5=${nextFeb.status} +3=${nextMar.status} msg='${nextJan.body.message || nextMar.body.message || ''}'`);

    // 2. The balance can be read for a given year
    await admin('PUT', `/leaves/${thisYear.body.data?._id}/approve`);
    await admin('PUT', `/leaves/${nextJan.body.data?._id}/approve`);
    const balanceNext = await emp('GET', `/leaves/balance?year=${Y + 1}`);
    const balanceNow = await emp('GET', '/leaves/balance');
    const badYear = await emp('GET', '/leaves/balance?year=abc');
    check('2 balance per year', balanceNext.body.data?.year === Y + 1 && balanceNext.body.data?.annual?.used === 5 &&
        balanceNow.body.data?.year === Y && balanceNow.body.data?.annual?.used === 10 && badYear.status === 400,
        `${Y + 1}: year=${balanceNext.body.data?.year} used=${balanceNext.body.data?.annual?.used}; default: year=${balanceNow.body.data?.year} used=${balanceNow.body.data?.annual?.used}; year=abc -> ${badYear.status}`);

    // 3. Leave on 31 December counts towards that year's quota
    const decYear = [Y, Y + 1, Y - 1].find(yr => isWeekday(`${yr}-12-31`));
    const dec31 = await request('personal', [`${decYear}-12-31`, `${decYear}-12-31`]);
    await admin('PUT', `/leaves/${dec31.body.data?._id}/approve`);
    const decBalance = await emp('GET', `/leaves/balance?year=${decYear}`);
    const fivePersonal = await request('personal', weekdays(decYear, 6, 5));
    check('3 31 December counts', dec31.status === 201 && decBalance.body.data?.personal?.used === 1 && fivePersonal.status === 400,
        `dec31=${dec31.status} personal used=${decBalance.body.data?.personal?.used} then 5 more=${fivePersonal.status}`);

    // 4. A request can't span two calendar years (and is told why, not refused as an overlap)
    const crossYear = await request('unpaid', [`${Y - 1}-12-28`, `${Y}-01-02`]);
    check('4 no request across two years', crossYear.status === 400 && /year/i.test(crossYear.body.message || ''),
        `status=${crossYear.status} msg='${crossYear.body.message || ''}'`);

    // 5. Dates from last year to next year only
    const twoAgo = await request('unpaid', weekdays(Y - 2, 6, 1));
    const twoAhead = await request('unpaid', weekdays(Y + 2, 6, 1));
    const lastYear = await request('unpaid', weekdays(Y - 1, 6, 1));
    check('5 dates within last year..next year', twoAgo.status === 400 && twoAhead.status === 400 && lastYear.status === 201,
        `${Y - 2}=${twoAgo.status} ${Y + 2}=${twoAhead.status} ${Y - 1}=${lastYear.status} msg='${twoAgo.body.message || ''}'`);

    // 6. Dates are plain calendar dates
    const withTime = await emp('POST', '/leaves', { type: 'unpaid', startDate: `${Y}-08-03T15:00:00+07:00`, endDate: `${Y}-08-03T15:00:00+07:00`, reason: 'verify-leave-dates' });
    const noSuchDay = await emp('POST', '/leaves', { type: 'unpaid', startDate: `${Y}-02-30`, endDate: `${Y}-02-30`, reason: 'verify-leave-dates' });
    check('6 dates must be YYYY-MM-DD', withTime.status === 400 && noSuchDay.status === 400, `with time=${withTime.status} Feb 30=${noSuchDay.status}`);

    // 7. A huge range is refused quickly instead of tying up the server (an
    //    employee with no leave yet, so it can't be refused as an overlap)
    const fresh = await createEmployee('Fresh');
    const started = Date.now();
    const huge = await fresh('POST', '/leaves', { type: 'unpaid', startDate: '0001-01-01', endDate: '9999-12-31', reason: 'verify-leave-dates' });
    const ms = Date.now() - started;
    check('7 huge range refused quickly', huge.status === 400 && ms < 500, `status=${huge.status} took=${ms}ms`);
} finally {
    for (const id of employeeIds) {
        const removed = await admin('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
