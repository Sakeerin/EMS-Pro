// Verifies who may change an employee's avatar, against a running API:
// the employee themself and HR/admin roles; anyone else gets 403 and no file
// is written.
//
// Usage (from server/): node scripts/verify-avatar-upload.js
// API_URL defaults to http://localhost:5000/api. Uses the seed superadmin and
// two throwaway employees; their records and any files written are removed.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const API = process.env.API_URL || 'http://localhost:5000/api';
const BAD_ID = `0x${'0'.repeat(22)}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

const client = () => {
    let cookie = '';
    const send = async (method, apiPath, init = {}) => {
        const res = await fetch(API + apiPath, { method, ...init, headers: { ...(cookie && { Cookie: cookie }), ...init.headers } });
        const token = res.headers.getSetCookie().find(c => c.startsWith('token='));
        if (token) cookie = token.split(';')[0];
        return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    return {
        api: (method, apiPath, json) => send(method, apiPath, json
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) }
            : {}),
        avatar: (employeeId) => {
            const form = new FormData();
            form.append('avatar', new Blob([PNG], { type: 'image/png' }), 'me.png');
            return send('POST', `/employees/${employeeId}/avatar`, { body: form });
        }
    };
};

const signIn = async (email, password) => {
    const c = client();
    const res = await c.api('POST', '/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`);
    return c;
};

const listAvatars = () => new Set(fs.existsSync(AVATAR_DIR) ? fs.readdirSync(AVATAR_DIR) : []);
const before = listAvatars();
const stamp = Date.now();
const admin = await signIn('superadmin@company.com', 'Password1');
const departmentId = (await admin.api('GET', '/departments')).body.data?.[0]?._id;
const employees = [];

const createEmployee = async (tag) => {
    const res = await admin.api('POST', '/employees', {
        employeeId: `AV${tag}${stamp}`, firstName: 'Avatar', lastName: tag, email: `av-${tag.toLowerCase()}-${stamp}@example.com`,
        position: 'Tester', department: departmentId, hireDate: '2026-01-05', salary: 30000
    });
    employees.push(res.body.data._id);
    const c = await signIn(res.body.data.email, res.body.tempPassword);
    await c.api('PUT', '/auth/password', { currentPassword: res.body.tempPassword, newPassword: `Avatar${tag}${stamp}x` });
    return { id: res.body.data._id, client: c };
};

try {
    const target = await createEmployee('Target');
    const other = await createEmployee('Other');

    // 1. Another employee can't change someone else's avatar, and nothing is written
    const filesBefore = listAvatars().size;
    const byOther = await other.client.avatar(target.id);
    const targetAfter = (await admin.api('GET', `/employees/${target.id}`)).body.data;
    check('1 other employee rejected', byOther.status === 403 && listAvatars().size === filesBefore && !targetAfter?.avatar,
        `status=${byOther.status} new files=${listAvatars().size - filesBefore} avatar=${targetAfter?.avatar || 'none'}`);

    // 2. The employee can change their own avatar
    const own = await target.client.avatar(target.id);
    check('2 employee updates own avatar', own.status === 200 && /^\/uploads\/avatars\//.test(own.body.data?.avatar || ''),
        `status=${own.status} avatar=${own.body.data?.avatar}`);

    // 3. HR/admin roles can change anyone's avatar
    const byAdmin = await admin.avatar(other.id);
    check('3 superadmin updates another avatar', byAdmin.status === 200 && /^\/uploads\/avatars\//.test(byAdmin.body.data?.avatar || ''),
        `status=${byAdmin.status} avatar=${byAdmin.body.data?.avatar}`);

    // 4. A malformed id is a 400, not a 500
    const malformed = await admin.avatar(BAD_ID);
    check('4 malformed id rejected', malformed.status === 400, `status=${malformed.status}`);

    // 5. Signed-out requests are rejected
    const anonymous = await client().avatar(target.id);
    check('5 signed-out request rejected', anonymous.status === 401, `status=${anonymous.status}`);
} finally {
    for (const id of employees) {
        const removed = await admin.api('DELETE', `/employees/${id}`);
        console.log(`cleanup: delete employee ${id} -> ${removed.status}`);
    }
    const created = [...listAvatars()].filter(name => !before.has(name));
    for (const name of created) fs.rmSync(path.join(AVATAR_DIR, name), { force: true });
    console.log(`cleanup: ${created.length} avatar file(s) removed`);
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
