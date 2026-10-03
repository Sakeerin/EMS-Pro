// Verifies who can open a payslip by id against a running API: employees see
// only their own payslips and only once they are approved or paid (the same
// ones "My Payslips" lists); HR and admin roles see any.
//
// Usage (from server/): node scripts/verify-payslip-access.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// two throwaway employees (one promoted to HR). Their March 2001 payroll is
// written through MongoDB (MONGODB_URI from .env) and goes with them.

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Payroll from '../models/Payroll.js';

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
    const email = `ps-${tag.toLowerCase()}-${stamp}@example.com`;
    const created = await admin('POST', '/employees', {
        employeeId: `PS${tag}${stamp}`, firstName: 'Payslip', lastName: tag, email,
        position: 'Tester', department: departmentId, hireDate: '2000-06-01', salary: 30000
    });
    const employeeId = created.body.data._id;
    employeeIds.push(employeeId);
    const api = client();
    const login = await api('POST', '/auth/login', { email, password: created.body.tempPassword });
    await api('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: `Payslip${tag}${stamp}x` });
    if (role) await admin('PUT', `/users/${login.body.data._id}`, { role });
    return { api, employeeId };
};

// One March 2001 payslip per status: they're separate records, so use different employees' slots
const payslip = async (employee, month, status) => String((await Payroll.create({
    employee, month, year: 2001, baseSalary: 30000, deductions: { socialSecurity: 750 }, status,
    ...(status === 'paid' && { paymentDate: new Date(2001, month - 1, 28) })
}))._id);

try {
    const emp = await createEmployee('Emp');
    const hr = await createEmployee('Hr', 'hr');
    const draft = await payslip(emp.employeeId, 3, 'draft');
    const approved = await payslip(emp.employeeId, 4, 'approved');
    const paid = await payslip(emp.employeeId, 5, 'paid');
    const colleague = await payslip(hr.employeeId, 3, 'paid');

    // 1. An employee can't open their own payslip while it's still a draft
    const ownDraft = await emp.api('GET', `/payroll/${draft}`);
    check('1 own draft hidden', ownDraft.status === 403 && !ownDraft.body.data,
        `status=${ownDraft.status} msg='${ownDraft.body.message || ''}' netSalary leaked=${ownDraft.body.data?.netSalary !== undefined}`);

    // 2. ...but can once it's approved or paid, matching My Payslips
    const ownApproved = await emp.api('GET', `/payroll/${approved}`);
    const ownPaid = await emp.api('GET', `/payroll/${paid}`);
    const myList = ((await emp.api('GET', '/payroll/my')).body.data || []).map(p => p._id).sort();
    check('2 own approved and paid visible', ownApproved.status === 200 && ownPaid.status === 200 && JSON.stringify(myList) === JSON.stringify([approved, paid].sort()),
        `approved=${ownApproved.status} paid=${ownPaid.status} my list=${myList.length} (draft listed=${myList.includes(draft)})`);

    // 3. Someone else's payslip stays closed, even when final
    const other = await emp.api('GET', `/payroll/${colleague}`);
    check('3 other employees\' payslips hidden', other.status === 403, `status=${other.status}`);

    // 4. HR and admin roles can open any payslip, drafts included
    const hrDraft = await hr.api('GET', `/payroll/${draft}`);
    const adminDraft = await admin('GET', `/payroll/${draft}`);
    check('4 HR roles see drafts', hrDraft.status === 200 && adminDraft.status === 200, `hr=${hrDraft.status} superadmin=${adminDraft.status}`);
} finally {
    for (const id of employeeIds) {
        const removed = await admin('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
    await mongoose.disconnect();
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
