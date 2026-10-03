// Verifies the dashboard's 7-day attendance trend against a running API: the
// labels are the last seven calendar days in the server's time zone, ending
// today, and each day's count sits under that day's label.
//
// Usage (from server/): node scripts/verify-attendance-trend.js
// API_URL defaults to http://localhost:5000/api. Run it on the same machine (or
// time zone) as the API. Uses the seed superadmin and a throwaway employee who
// checks in today through the API and gets a record two days ago written
// through MongoDB (MONGODB_URI from .env); both go with the employee.

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

// Local midnight `daysAgo` days back, and its YYYY-MM-DD label in local time
const localDay = (daysAgo) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - daysAgo);
    return day;
};
const label = (date) => date.toLocaleDateString('en-CA');

const admin = client();
const adminLogin = await admin('POST', '/auth/login', { email: 'superadmin@company.com', password: 'Password1' });
if (adminLogin.status !== 200) {
    console.error('superadmin login failed:', adminLogin.status, '(clear rl:* keys in Redis if rate limited)');
    process.exit(2);
}
await mongoose.connect(process.env.MONGODB_URI);

const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const stamp = Date.now();
const email = `at-${stamp}@example.com`;
const created = await admin('POST', '/employees', {
    employeeId: `AT${stamp}`, firstName: 'Attendance', lastName: 'Trend', email,
    position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 30000
});
const employeeId = created.body.data?._id;

try {
    // A present day two days ago, then today's check-in through the API (its
    // write also clears the cached dashboard numbers)
    await Attendance.create({ employee: employeeId, date: localDay(2), checkIn: { time: new Date(localDay(2).getTime() + 9 * 3600000) }, status: 'present' });
    const emp = client();
    await emp('POST', '/auth/login', { email, password: created.body.tempPassword });
    await emp('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: `AttTrend${stamp}x` });
    const checkIn = await emp('POST', '/attendance/check-in', {});

    const stats = (await admin('GET', '/dashboard/stats')).body.data || {};
    const trend = stats.attendanceTrend || [];
    const expectedLabels = [6, 5, 4, 3, 2, 1, 0].map(n => label(localDay(n)));

    // 1. The labels are the last seven local calendar days, ending today
    check('1 labels are the last 7 local days', JSON.stringify(trend.map(d => d.date)) === JSON.stringify(expectedLabels),
        `got ${trend.map(d => d.date).join(',')} expected ${expectedLabels.join(',')}`);

    // 2. Today's bar is today's attendance, and the record from two days ago sits under that day
    const at = (day) => trend.find(d => d.date === label(localDay(day)))?.present;
    check('2 counts under the right day', checkIn.status === 201 && at(0) === stats.attendance?.present && at(0) >= 1 && at(2) >= 1,
        `check-in=${checkIn.status} today=${at(0)} (present today=${stats.attendance?.present}) two days ago=${at(2)} yesterday=${at(1)}`);
} finally {
    if (employeeId) {
        const removed = await admin('DELETE', `/employees/${employeeId}`);
        console.log(`cleanup: delete employee ${employeeId} -> ${removed.status}`);
    }
    await mongoose.disconnect();
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
