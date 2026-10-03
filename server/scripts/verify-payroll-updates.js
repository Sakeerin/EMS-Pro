// Verifies payroll edits and status changes against a running API: only the
// adjustment fields can be edited, totals are recalculated, payroll moves
// draft -> approved -> paid with no skipping or going back, edits stop once it
// is approved, nobody edits, approves or pays their own payroll, and saves are
// version-checked.
//
// Usage (from server/): node scripts/verify-payroll-updates.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// two throwaway employees (one promoted to admin). Their February 2001 payroll
// is written through MongoDB (MONGODB_URI from .env) and goes with them.

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Payroll from '../models/Payroll.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API = process.env.API_URL || 'http://localhost:5000/api';
const BAD_ID = 'not-an-id';

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
    const email = `pu-${tag.toLowerCase()}-${stamp}@example.com`;
    const created = await admin('POST', '/employees', {
        employeeId: `PU${tag}${stamp}`, firstName: 'Payroll', lastName: tag, email,
        position: 'Tester', department: departmentId, hireDate: '2000-06-01', salary: 30000
    });
    const employeeId = created.body.data._id;
    employeeIds.push(employeeId);
    const api = client();
    const login = await api('POST', '/auth/login', { email, password: created.body.tempPassword });
    await api('PUT', '/auth/password', { currentPassword: created.body.tempPassword, newPassword: `Payroll${tag}${stamp}x` });
    if (role) await admin('PUT', `/users/${login.body.data._id}`, { role });
    return { api, employeeId };
};

// A generated-style February 2001 draft: 30,000 base, 750 social security
const draftFor = async (employee) => String((await Payroll.create({
    employee, month: 2, year: 2001, baseSalary: 30000, workingDays: 20,
    deductions: { socialSecurity: 750 }
}))._id);
const stored = (id) => Payroll.findById(id).lean();

try {
    const emp = await createEmployee('Emp');
    const payrollAdmin = await createEmployee('Admin', 'admin');
    const empPayroll = await draftFor(emp.employeeId);
    const ownPayroll = await draftFor(payrollAdmin.employeeId);

    // 1. Adjustments are saved and the totals follow; untouched deductions survive
    const edit = await admin('PUT', `/payroll/${empPayroll}`, { bonus: 5000, allowances: { meal: 500 }, deductions: { tax: 1000 }, notes: 'Q1 bonus' });
    let p = await stored(empPayroll);
    check('1 adjustments recalculate totals', edit.status === 200 && p.grossSalary === 35500 && p.totalDeductions === 1750 && p.netSalary === 33750 && p.deductions.socialSecurity === 750,
        `status=${edit.status} gross=${p.grossSalary} deductions=${p.totalDeductions} net=${p.netSalary} socialSecurity=${p.deductions.socialSecurity}`);

    // 2. Computed and identity fields can't be set, and nothing is saved when one is sent
    const forged = await admin('PUT', `/payroll/${empPayroll}`, { bonus: 1, netSalary: 999999, status: 'paid', employee: payrollAdmin.employeeId });
    p = await stored(empPayroll);
    check('2 non-editable fields refused', forged.status === 400 && p.netSalary === 33750 && p.status === 'draft' && p.bonus === 5000 && String(p.employee) === emp.employeeId,
        `status=${forged.status} net=${p.netSalary} state=${p.status} bonus=${p.bonus} msg='${forged.body.message || ''}'`);

    // 3. Amounts must be numbers of zero or more
    const negative = await admin('PUT', `/payroll/${empPayroll}`, { bonus: -100 });
    const text = await admin('PUT', `/payroll/${empPayroll}`, { deductions: { tax: 'lots' } });
    const method = await admin('PUT', `/payroll/${empPayroll}`, { paymentMethod: 'crypto' });
    p = await stored(empPayroll);
    check('3 invalid amounts refused', negative.status === 400 && text.status === 400 && method.status === 400 && p.bonus === 5000 && p.deductions.tax === 1000,
        `negative=${negative.status} text=${text.status} method=${method.status} bonus=${p.bonus} tax=${p.deductions.tax}`);

    // 4. draft -> approved -> paid, no skipping, no going back, no edits once approved
    const payDraft = await admin('PUT', `/payroll/${empPayroll}/pay`);
    const approve = await admin('PUT', `/payroll/${empPayroll}/approve`);
    const approveAgain = await admin('PUT', `/payroll/${empPayroll}/approve`);
    const editApproved = await admin('PUT', `/payroll/${empPayroll}`, { bonus: 9000 });
    const pay = await admin('PUT', `/payroll/${empPayroll}/pay`);
    const payAgain = await admin('PUT', `/payroll/${empPayroll}/pay`);
    const approvePaid = await admin('PUT', `/payroll/${empPayroll}/approve`);
    p = await stored(empPayroll);
    check('4 status moves draft -> approved -> paid only',
        payDraft.status === 400 && approve.status === 200 && approveAgain.status === 400 && editApproved.status === 400 &&
        pay.status === 200 && payAgain.status === 400 && approvePaid.status === 400 && p.status === 'paid' && p.bonus === 5000 && Boolean(p.paymentDate),
        `pay draft=${payDraft.status} approve=${approve.status} again=${approveAgain.status} edit approved=${editApproved.status} pay=${pay.status} again=${payAgain.status} approve paid=${approvePaid.status} final=${p.status} bonus=${p.bonus}`);

    // 5. An admin can't edit, approve or pay their own payroll; someone else can
    const selfEdit = await payrollAdmin.api('PUT', `/payroll/${ownPayroll}`, { bonus: 100000 });
    const selfApprove = await payrollAdmin.api('PUT', `/payroll/${ownPayroll}/approve`);
    const otherApprove = await admin('PUT', `/payroll/${ownPayroll}/approve`);
    const selfPay = await payrollAdmin.api('PUT', `/payroll/${ownPayroll}/pay`);
    const otherPay = await admin('PUT', `/payroll/${ownPayroll}/pay`);
    p = await stored(ownPayroll);
    check('5 no changes to your own payroll', selfEdit.status === 403 && selfApprove.status === 403 && otherApprove.status === 200 && selfPay.status === 403 && otherPay.status === 200 && p.bonus === 0,
        `self edit=${selfEdit.status} self approve=${selfApprove.status} superadmin approve=${otherApprove.status} self pay=${selfPay.status} superadmin pay=${otherPay.status} bonus=${p.bonus}`);

    // 6. Malformed ids are a 400, not a 500
    const codes = [
        (await admin('GET', `/payroll/${BAD_ID}`)).status,
        (await admin('PUT', `/payroll/${BAD_ID}`, { bonus: 1 })).status,
        (await admin('PUT', `/payroll/${BAD_ID}/approve`)).status,
        (await admin('PUT', `/payroll/${BAD_ID}/pay`)).status
    ];
    check('6 malformed ids rejected', codes.every(c => c === 400), `get/put/approve/pay=${codes.join('/')}`);

    // 7. Saves are version-checked, so a copy loaded before someone else's change can't overwrite it
    const fresh = await Payroll.findById(empPayroll);
    const outdated = await Payroll.findById(empPayroll);
    fresh.notes = 'first change';
    await fresh.save();
    outdated.notes = 'overwrite';
    let saveError = null;
    try { await outdated.save(); } catch (err) { saveError = err.name; }
    check('7 outdated saves refused', saveError === 'VersionError' && (await stored(empPayroll)).notes === 'first change',
        `error=${saveError} notes='${(await stored(empPayroll)).notes}'`);
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
