// Verifies overtime rules against a running API: long days lose an unpaid lunch
// hour, overtime waits for HR approval (never your own), and payroll pays
// approved overtime only.
//
// Usage (from server/): node scripts/verify-overtime.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// two throwaway employees (one promoted to HR). A long day is faked by checking
// in, moving the check-in time back through MongoDB (MONGODB_URI from .env) and
// checking out; January 2001 attendance for the payroll check is written there
// directly. The throwaway employees take their attendance and payroll with them,
// and the rest of the January 2001 payroll run is deleted. The payroll check is
// skipped when January 2001 already has payroll.

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import Payroll from '../models/Payroll.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API = process.env.API_URL || 'http://localhost:5000/api';
const HOUR = 60 * 60 * 1000;

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
await mongoose.connect(process.env.MONGODB_URI);

const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
const stamp = Date.now();
const employeeIds = [];

const createEmployee = async (tag, role) => {
    const email = `ot-${tag.toLowerCase()}-${stamp}@example.com`;
    const created = await admin('POST', '/employees', {
        employeeId: `OT${tag}${stamp}`, firstName: 'Overtime', lastName: tag, email,
        position: 'Tester', department: departmentId, hireDate: '2000-06-01', salary: 35200
    });
    const employeeId = created.body.data._id;
    employeeIds.push(employeeId);
    const api = client();
    const login = await api('POST', '/auth/login', { email, password: created.body.tempPassword });
    await api('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: `Overtime${tag}${stamp}x` });
    if (role) await admin('PUT', `/users/${login.body.data._id}`, { role });
    return { api, employeeId };
};

// Check in, move the check-in back so the day spans `hours`, then check out
const workDay = async (api, hours) => {
    const checkIn = await api('POST', '/attendance/check-in', {});
    const id = checkIn.body.data?._id;
    if (id) {
        await Attendance.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(id) },
            { $set: { 'checkIn.time': new Date(Date.now() - hours * HOUR) } }
        );
    }
    const checkOut = await api('POST', '/attendance/check-out', {});
    return { id, record: checkOut.body.data || {}, statuses: `in=${checkIn.status} out=${checkOut.status}` };
};

// A finished day in January 2001, saved through the model so its hook runs
const pastDay = (employee, day, startHour, endHour) => Attendance.create({
    employee,
    date: new Date(2001, 0, day),
    checkIn: { time: new Date(2001, 0, day, startHour) },
    checkOut: { time: new Date(2001, 0, day, endHour) },
    status: 'present'
});

const near = (value, expected) => typeof value === 'number' && Math.abs(value - expected) < 0.05;
const summary = (r) => `worked=${r.workingHours} ot=${r.overtime} otStatus=${r.overtimeStatus}`;
let payrollRunCreated = false;

try {
    const emp = await createEmployee('Emp');
    const hr = await createEmployee('Hr', 'hr');

    // 1. A 9-to-6 style day (8h50m on site) is under 8 hours once lunch is taken out: no overtime
    const normal = await workDay(emp.api, 8 + 50 / 60);
    check('1 lunch hour deducted, no overtime', near(normal.record.workingHours, 7.83) && normal.record.overtime === 0 && normal.record.overtimeStatus === 'none',
        `${normal.statuses} ${summary(normal.record)}`);

    // 2. An 11-hour day: 10 worked, 2 of them overtime, waiting for approval
    const long = await workDay(hr.api, 11);
    check('2 long day: overtime after lunch, pending approval', near(long.record.workingHours, 10) && near(long.record.overtime, 2) && long.record.overtimeStatus === 'pending',
        `${long.statuses} ${summary(long.record)}`);

    // 3. Short days keep every hour (no break is due within 5 hours)
    const short = await pastDay(emp.employeeId, 2, 9, 13);
    check('3 short day keeps all hours', short.workingHours === 4 && short.overtime === 0,
        `worked=${short.workingHours} ot=${short.overtime}`);

    // 4. HR roles see pending overtime; employees can't
    const hrList = await hr.api('GET', '/attendance/overtime');
    const adminList = await admin('GET', '/attendance/overtime');
    const empList = await emp.api('GET', '/attendance/overtime');
    const listed = (res) => (res.body.data || []).some(r => r._id === long.id);
    check('4 pending overtime list for HR roles only', hrList.status === 200 && adminList.status === 200 && listed(adminList) && empList.status === 403,
        `hr=${hrList.status} admin=${adminList.status} listed=${listed(adminList)} employee=${empList.status}`);

    // 5. Nobody approves their own overtime; employees can't approve at all; approved is final
    const self = await hr.api('PUT', `/attendance/${long.id}/overtime`, { decision: 'approve' });
    const byEmployee = await emp.api('PUT', `/attendance/${long.id}/overtime`, { decision: 'approve' });
    const approved = await admin('PUT', `/attendance/${long.id}/overtime`, { decision: 'approve' });
    const again = await admin('PUT', `/attendance/${long.id}/overtime`, { decision: 'reject' });
    const bad = await admin('PUT', `/attendance/${long.id}/overtime`, { decision: 'maybe' });
    check('5 approval rules', self.status === 403 && byEmployee.status === 403 && approved.status === 200 && approved.body.data?.overtimeStatus === 'approved' && again.status === 400 && bad.status === 400,
        `self=${self.status} employee=${byEmployee.status} superadmin=${approved.status}/${approved.body.data?.overtimeStatus} again=${again.status} bad decision=${bad.status}`);

    // 6. Payroll pays approved overtime only: 2h approved, 1h pending, 3h rejected
    const existingRun = await Payroll.countDocuments({ month: 1, year: 2001 });
    if (existingRun > 0) {
        console.log(`SKIP  6 payroll counts approved overtime only  (January 2001 already has ${existingRun} payroll records)`);
    } else {
        const approvedDay = await pastDay(emp.employeeId, 8, 9, 20);
        await pastDay(emp.employeeId, 9, 9, 19);
        const rejectedDay = await pastDay(emp.employeeId, 10, 9, 21);
        const approve = await hr.api('PUT', `/attendance/${approvedDay._id}/overtime`, { decision: 'approve' });
        const reject = await hr.api('PUT', `/attendance/${rejectedDay._id}/overtime`, { decision: 'reject' });
        const generated = await admin('POST', '/payroll/generate', { month: 1, year: 2001 });
        payrollRunCreated = generated.status === 201;
        const payroll = await Payroll.findOne({ employee: emp.employeeId, month: 1, year: 2001 });
        check('6 payroll counts approved overtime only', near(payroll?.overtime?.hours, 2) && /pending/i.test(generated.body.message || ''),
            `approve=${approve.status} reject=${reject.status} generate=${generated.status} ot hours=${payroll?.overtime?.hours} msg='${generated.body.message || ''}'`);
    }
} finally {
    for (const id of employeeIds) {
        const removed = await admin('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
    if (payrollRunCreated) {
        const { deletedCount } = await Payroll.deleteMany({ month: 1, year: 2001 });
        console.log(`cleanup: delete January 2001 payroll run -> ${deletedCount} records`);
    }
    await mongoose.disconnect();
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
