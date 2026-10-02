// Verifies upload access control, id validation and own-account guards
// against a running API (and the Vite dev server for the /uploads proxy).
//
// Usage (from server/): node scripts/verify-security-fixes.js
// API_URL defaults to http://localhost:5000/api, CLIENT_URL to
// http://localhost:5173. Uses the seed superadmin and creates throwaway
// employees, files and a throwaway superadmin, all removed at the end (the
// superadmin through MongoDB, since the API only deactivates users).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API = process.env.API_URL || 'http://localhost:5000/api';
const SERVER = API.replace(/\/api$/, '');
const CLIENT = process.env.CLIENT_URL || 'http://localhost:5173';
const BAD_ID = `0x${'0'.repeat(22)}`; // passes isMongoId(), can't be cast to an ObjectId
const RANDOM_NAME = /^(avatar|jd)-[0-9a-f]{32}\.(png|pdf)$/;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

const client = () => {
    let cookie = '';
    const send = async (method, url, init = {}) => {
        const res = await fetch(url, {
            method,
            redirect: 'manual',
            ...init,
            headers: { ...(cookie && { Cookie: cookie }), ...init.headers }
        });
        const token = res.headers.getSetCookie().find(c => c.startsWith('token='));
        if (token) cookie = token.split(';')[0];
        return res;
    };
    return {
        api: async (method, apiPath, json) => {
            const res = await send(method, API + apiPath, json
                ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) }
                : {});
            return { status: res.status, body: await res.json().catch(() => ({})) };
        },
        upload: async (apiPath, field, name, type, content) => {
            const form = new FormData();
            form.append(field, new Blob([content], { type }), name);
            const res = await send('POST', API + apiPath, { body: form });
            return { status: res.status, body: await res.json().catch(() => ({})) };
        },
        get: async (url) => {
            const res = await send('GET', url);
            return { status: res.status, text: await res.text(), type: res.headers.get('content-type') || '' };
        }
    };
};

const signIn = async (email, password) => {
    const c = client();
    const res = await c.api('POST', '/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`login ${email}: ${res.status} ${res.body.message || ''}`);
    return c;
};
// New accounts must replace their temporary password before using the API
const signInFresh = async (email, tempPassword, newPassword) => {
    const c = await signIn(email, tempPassword);
    await c.api('PUT', '/auth/password', { currentPassword: tempPassword, newPassword });
    return c;
};

const stamp = Date.now();
const admin = await signIn('superadmin@company.com', 'Password1');
const departmentId = (await admin.api('GET', '/departments')).body.data?.[0]?._id;
const createEmployee = (tag) => admin.api('POST', '/employees', {
    employeeId: `SEC${tag}${stamp}`, firstName: 'Sec', lastName: tag, email: `sec-${tag.toLowerCase()}-${stamp}@example.com`,
    position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 30000
});

const employeeIds = [];
const files = [];
const throwawayEmail = `sec-admin-${stamp}@example.com`;

try {
    const owner = await createEmployee('Owner');
    const other = await createEmployee('Other');
    employeeIds.push(owner.body.data?._id, other.body.data?._id);
    const ownerClient = await signInFresh(owner.body.data.email, owner.body.tempPassword, `Owner${stamp}x`);
    const otherClient = await signInFresh(other.body.data.email, other.body.tempPassword, `Other${stamp}x`);
    const anonymous = client();

    const avatarRes = await ownerClient.upload(`/employees/${owner.body.data._id}/avatar`, 'avatar', 'me.png', 'image/png', PNG);
    const avatarUrl = avatarRes.body.data?.avatar;
    const jdRes = await admin.upload(`/employees/${owner.body.data._id}/upload-jd`, 'file', 'jd.pdf', 'application/pdf', '%PDF-1.4 verify');
    const jdUrl = jdRes.body.data?.filePath;
    for (const url of [avatarUrl, jdUrl]) if (url) files.push(path.join(__dirname, '..', url));
    if (!avatarUrl || !jdUrl) throw new Error(`uploads failed: avatar=${avatarRes.status} jd=${jdRes.status}`);

    // 1. Avatars need a login, but any logged-in user may see them
    const avatarAnon = await anonymous.get(SERVER + avatarUrl);
    const avatarOther = await otherClient.get(SERVER + avatarUrl);
    check('1 avatar needs login', avatarAnon.status === 401 && avatarOther.status === 200,
        `anonymous=${avatarAnon.status} other employee=${avatarOther.status}`);

    // 2. A JD file is only for its employee and HR/admin roles
    const jdAnon = await anonymous.get(SERVER + jdUrl);
    const jdOther = await otherClient.get(SERVER + jdUrl);
    const jdOwner = await ownerClient.get(SERVER + jdUrl);
    const jdAdmin = await admin.get(SERVER + jdUrl);
    check('2 JD limited to owner and HR roles',
        jdAnon.status === 401 && jdOther.status === 403 && jdOwner.status === 200 && jdOwner.text.startsWith('%PDF') && jdAdmin.status === 200,
        `anonymous=${jdAnon.status} other=${jdOther.status} owner=${jdOwner.status} superadmin=${jdAdmin.status}`);

    // 3. Path variants don't get around the JD check
    const fileName = path.basename(jdUrl);
    const upper = await otherClient.get(`${SERVER}/uploads/JD/${fileName}`);
    const doubleSlash = await otherClient.get(`${SERVER}/uploads//jd/${fileName}`);
    check('3 JD path variants blocked', upper.status !== 200 && doubleSlash.status !== 200,
        `/uploads/JD=${upper.status} /uploads//jd=${doubleSlash.status}`);

    // 4. New uploads get unguessable names
    check('4 random upload names', RANDOM_NAME.test(path.basename(avatarUrl)) && RANDOM_NAME.test(fileName),
        `avatar=${path.basename(avatarUrl)} jd=${fileName}`);

    // 5. The Vite dev server forwards /uploads to the API (skipped if it isn't running)
    const viaClient = await ownerClient.get(CLIENT + jdUrl).catch(() => null);
    if (viaClient === null) {
        console.log(`SKIP  5 /uploads through the dev server (${CLIENT} not reachable)`);
    } else {
        check('5 /uploads through the dev server', viaClient.status === 200 && viaClient.text.startsWith('%PDF'),
            `status=${viaClient.status} type=${viaClient.type}`);
    }

    // 6. Malformed ids are 400s, not 500s
    const malformed = [
        await admin.api('GET', `/users/${BAD_ID}`),
        await admin.api('PUT', `/users/${BAD_ID}`, { isActive: true }),
        await admin.api('PUT', `/users/${BAD_ID}/link-employee`, { employeeId: null }),
        await admin.api('DELETE', `/users/${BAD_ID}`),
        await admin.api('PUT', `/employees/${BAD_ID}`, { position: 'x' })
    ].map(r => r.status);
    check('6 malformed ids rejected', malformed.every(s => s === 400), `statuses=${malformed.join(',')}`);

    // 7. Own-account guards hold for an uppercase id (tested on a throwaway superadmin)
    const created = await admin.api('POST', '/users', { email: throwawayEmail, password: `Temp${stamp}aA1`, role: 'superadmin' });
    const sa = await signInFresh(throwawayEmail, `Temp${stamp}aA1`, `Super${stamp}aA1`);
    const upperId = created.body.data._id.toUpperCase();
    const ownRole = await sa.api('PUT', `/users/${upperId}`, { role: 'employee' });
    const ownDelete = await sa.api('DELETE', `/users/${upperId}`);
    check('7 own-account guards with uppercase id', ownRole.status === 400 && ownDelete.status === 400,
        `role change=${ownRole.status} deactivate=${ownDelete.status}`);
} finally {
    for (const id of employeeIds.filter(Boolean)) {
        const removed = await admin.api('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
    for (const file of files) fs.rmSync(file, { force: true });
    await mongoose.connect(process.env.MONGODB_URI);
    const { deletedCount } = await mongoose.connection.db.collection('users').deleteMany({ email: throwawayEmail });
    await mongoose.disconnect();
    console.log(`cleanup: ${files.length} uploaded file(s) removed, ${deletedCount} throwaway superadmin removed`);
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
