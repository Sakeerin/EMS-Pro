# Temporary Password Delivery and Forced Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New employees receive a one-time temporary password that works, superadmin can reset passwords, and anyone on a temporary password must change it before using the app.

**Architecture:** The server returns the generated password once (create-employee and a new superadmin reset endpoint) and never stores it in plaintext. The shared `protect` middleware blocks every API except me/password/logout while `mustChangePassword` is set. The client shows the password in a shared modal and routes flagged users to a dedicated change-password page.

**Tech Stack:** Node 22 + Express 4 + Mongoose 8 (ESM), React 18 + Vite 5 + React Router 6 + TanStack Query 5, react-hot-toast, react-icons/fi.

**Spec:** `docs/superpowers/specs/2026-10-02-temp-password-design.md`

## Global Constraints

- The temporary password is never stored in plaintext. It appears only in the create-employee 201 response and the reset 200 response.
- Generator, unchanged from today: `crypto.randomBytes(4).toString('hex') + 'A1'`.
- Blocked-request response, exactly: `403 { success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Password change required' }`.
- Allowed while flagged, exactly: `GET /api/auth/me`, `PUT /api/auth/password`, `POST /api/auth/logout`.
- Reset endpoint: `POST /api/users/:id/reset-password`, superadmin only. Returns 400 "Use Settings to change your own password" for the caller's own id, 404 "User not found", 400 "Validation failed" for a malformed id, and `200 { success: true, data: { tempPassword } }` on success.
- Same-password message, exactly: "New password must be different from the current password".
- The temporary-password modal closes only through its Done button.
- No new dependencies. No test framework exists; server behaviour is verified by `server/scripts/verify-temp-password.js` against the running API, and client behaviour by `vite build` plus the browser checks listed in each task.
- Commit locally at the end of each task. Push only when the user asks.

**Deviation from the spec, deliberately:** the same-password rule is added to the existing express-validator chain on `PUT /api/auth/password`, so it answers `400 { message: 'Validation failed', errors: [{ field: 'newPassword', message: 'New password must be different from the current password' }] }` instead of a bare message. This matches how that route already reports its other password rules. It also keeps the check deterministic: a generated password made only of digits fails the strength regex first and would otherwise mask the same-password response.

## Review Focus

1. **The JD upload fails after the employee was created.** The one-time password must still be shown, because the employee and account already exist. (Task 3, browser check 6.)
2. **The modal is dismissed by a backdrop click or Escape before anyone copies the password.** The password would be lost; the modal must stay open until Done. (Task 3, browser check 3.)
3. **The Clipboard API is unavailable** (the app is served over plain HTTP on an intranet IP). Copy must show an error toast, the password must stay visible and selectable, and nothing may crash. (Task 3, browser check 5.)
4. **A flagged user reloads `/change-password`, or types `/dashboard` or another URL.** They must land on `/change-password` without a redirect loop. A user who isn't flagged and opens `/change-password` must land on `/dashboard`. (Task 5, browser checks 2–4.)
5. **A reset request with a malformed or unknown user id** must return 400 or 404, not 500. (Task 1, script check 8.)

---

## Shared commands

Clear the login rate-limit counters. The verification script logs in five times, which is exactly the login limit for 15 minutes:

```bash
for k in $(docker exec ems-redis redis-cli --scan --pattern 'rl:*' | tr -d '\r'); do docker exec ems-redis redis-cli del "$k" >/dev/null; done
```

Run the server verification. The backend must be running on port 5000, with `ems-mongo` and `ems-redis` up:

```bash
cd server && node scripts/verify-temp-password.js
```

---

### Task 1: Temporary password on create, and superadmin reset (server)

**Files:**
- Create: `server/scripts/verify-temp-password.js`
- Modify: `server/models/User.js` (imports; add a static after `validatePasswordStrength`)
- Modify: `server/controllers/employee.controller.js:2` (crypto import), `:252` (generator), `:266-271` (201 response)
- Modify: `server/routes/user.routes.js` (new route before `router.delete('/:id'`)

**Interfaces:**
- Produces: `User.generateTempPassword(): string`.
- Produces: `POST /api/employees` 201 body gains `tempPassword: string`.
- Produces: `POST /api/users/:id/reset-password` → `200 { success: true, data: { tempPassword: string } }`.

- [ ] **Step 1: Write the verification script**

Create `server/scripts/verify-temp-password.js`:

```js
// Verifies the temporary-password flow against a running API:
// create employee -> one-time password -> forced change -> superadmin reset.
//
// Usage (from server/): node scripts/verify-temp-password.js
// API_URL defaults to http://localhost:5000/api. Uses the seed accounts from
// scripts/seed.js and makes exactly 5 logins, the login rate limit per 15
// minutes, so clear the rl:* keys in Redis before running it again sooner.

const API = process.env.API_URL || 'http://localhost:5000/api';
const SEED_PASSWORD = 'Password1';
const SAME_PASSWORD_MESSAGE = 'New password must be different from the current password';

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

// Minimal HTTP client that keeps the auth cookie between calls
const client = () => {
    let cookie = '';
    return async (method, path, body) => {
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
};

const login = async (email, password) => {
    const api = client();
    const res = await api('POST', '/auth/login', { email, password });
    if (res.status === 429) {
        console.error('Rate limited on login: clear the rl:* keys in Redis or wait 15 minutes');
        process.exit(2);
    }
    return { api, res };
};

const { api: admin, res: adminLogin } = await login('superadmin@company.com', SEED_PASSWORD);
if (adminLogin.status !== 200) {
    console.error('superadmin login failed:', adminLogin.status, adminLogin.body.message);
    process.exit(2);
}
const superadminId = adminLogin.body.data._id;

const departmentId = (await admin('GET', '/departments')).body.data?.[0]?._id;
if (!departmentId) {
    console.error('no department found; run npm run seed first');
    process.exit(2);
}

const stamp = Date.now();
const email = `tmp${stamp}@example.com`;
let employeeId;

try {
    // 1. Creating an employee returns the one-time password
    const created = await admin('POST', '/employees', {
        employeeId: `TMP${stamp}`, firstName: 'Temp', lastName: 'Password', email,
        department: departmentId, position: 'Tester', hireDate: '2026-10-01', salary: 30000
    });
    employeeId = created.body.data?._id;
    const temp1 = created.body.tempPassword;
    check('1 create returns tempPassword', created.status === 201 && typeof temp1 === 'string' && temp1.length >= 8,
        `status=${created.status} tempPassword=${temp1 ? 'present' : 'missing'}`);

    // 2. The employee can log in with it
    const { api: emp, res: empLogin } = await login(email, temp1 || 'missing');
    check('2 login with tempPassword', empLogin.status === 200, `status=${empLogin.status}`);
    const empUserId = empLogin.body.data?._id;

    // 3. Everything except me/password/logout is blocked until the change
    const blocked = await emp('GET', '/attendance/today');
    const me = await emp('GET', '/auth/me');
    check('3 other APIs blocked until change',
        blocked.status === 403 && blocked.body.code === 'PASSWORD_CHANGE_REQUIRED' && me.status === 200,
        `attendance=${blocked.status}/${blocked.body.code} me=${me.status}`);

    // 4. Changing to the same password is rejected
    const same = await emp('PUT', '/auth/password', { currentPassword: temp1, newPassword: temp1 });
    check('4 same password rejected',
        same.status === 400 && (same.body.errors || []).some(e => e.message === SAME_PASSWORD_MESSAGE),
        `status=${same.status} errors=${JSON.stringify((same.body.errors || []).map(e => e.message))}`);

    // 5. A real change clears the flag and unblocks the API
    const newPassword = `Changed${stamp}a`;
    const changed = await emp('PUT', '/auth/password', { currentPassword: temp1, newPassword });
    const unblocked = await emp('GET', '/attendance/today');
    const meAfter = await emp('GET', '/auth/me');
    check('5 change unblocks',
        changed.status === 200 && unblocked.status === 200 && meAfter.body.data?.mustChangePassword === false,
        `change=${changed.status} attendance=${unblocked.status} flag=${meAfter.body.data?.mustChangePassword}`);

    // 6. Superadmin reset: old password stops working, new one works and is flagged
    const reset = await admin('POST', `/users/${empUserId}/reset-password`);
    const temp2 = reset.body.data?.tempPassword;
    const { res: oldLogin } = await login(email, newPassword);
    const { api: emp2, res: tempLogin } = await login(email, temp2 || 'missing');
    const flagged = await emp2('GET', '/auth/me');
    check('6 superadmin reset',
        reset.status === 200 && !!temp2 && oldLogin.status === 401 && tempLogin.status === 200
            && flagged.body.data?.mustChangePassword === true,
        `reset=${reset.status} old=${oldLogin.status} temp=${tempLogin.status} flag=${flagged.body.data?.mustChangePassword}`);

    // 7. Superadmin cannot reset their own account here
    const own = await admin('POST', `/users/${superadminId}/reset-password`);
    check('7 own account rejected', own.status === 400, `status=${own.status} msg='${own.body.message}'`);

    // 8. Malformed and unknown ids are client errors, not 500s
    const malformed = await admin('POST', '/users/not-an-id/reset-password');
    const unknown = await admin('POST', '/users/000000000000000000000000/reset-password');
    check('8 malformed and unknown ids', malformed.status === 400 && unknown.status === 404,
        `malformed=${malformed.status} unknown=${unknown.status}`);

    // 9. Only superadmin may reset
    const { api: hr } = await login('hr@company.com', SEED_PASSWORD);
    const hrReset = await hr('POST', `/users/${empUserId}/reset-password`);
    check('9 non-superadmin rejected', hrReset.status === 403, `status=${hrReset.status}`);
} finally {
    if (employeeId) {
        const removed = await admin('DELETE', `/employees/${employeeId}`);
        console.log(`cleanup: delete test employee -> ${removed.status}`);
    }
}

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

Run the clear-counters command, then the verification command (see Shared commands).
Expected: checks 1–8 FAIL (no `tempPassword` in the create response; the reset route answers 404 "Route not found"). Check 9 already PASSES, because the router-level `authorize('superadmin')` in `user.routes.js` rejects HR before route matching, and it stays as a guard. The output ends with `8 check(s) failed`, the exit code is 1, and cleanup prints `-> 200`.

- [ ] **Step 3: Add the generator to the User model**

In `server/models/User.js`, add the import under the existing two:

```js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
```

and add this static directly after the `validatePasswordStrength` static:

```js
// Static method to generate a temporary password for new or reset accounts
userSchema.statics.generateTempPassword = function () {
    return crypto.randomBytes(4).toString('hex') + 'A1';
};
```

- [ ] **Step 4: Return the password from createEmployee**

In `server/controllers/employee.controller.js`, delete line 2 (`import crypto from 'crypto';`), which has no other users in this file. Replace

```js
        const randomPassword = crypto.randomBytes(4).toString('hex') + 'A1';

        const user = new User({
            email: req.body.email,
            password: randomPassword,
```

with

```js
        const tempPassword = User.generateTempPassword();

        const user = new User({
            email: req.body.email,
            password: tempPassword,
```

and in the same function's success response replace

```js
            userCreated: true,
            message: `Employee created. User account created with email: ${req.body.email}. User must change password on first login.`
```

with

```js
            userCreated: true,
            // Shown once to the creator; only the hash is stored
            tempPassword,
            message: `Employee created. User account created with email: ${req.body.email}. User must change password on first login.`
```

- [ ] **Step 5: Add the reset route**

In `server/routes/user.routes.js`, insert directly above the `// @route   DELETE /api/users/:id` comment block:

```js
// @route   POST /api/users/:id/reset-password
// @desc    Replace a user's password with a temporary one they must change at next login
// @access  SuperAdmin only
router.post('/:id/reset-password',
    [param('id').isMongoId().withMessage('Invalid user ID')],
    validate,
    async (req, res) => {
        try {
            if (req.params.id === req.user._id.toString()) {
                return res.status(400).json({
                    success: false,
                    message: 'Use Settings to change your own password'
                });
            }

            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const tempPassword = User.generateTempPassword();
            user.password = tempPassword;
            user.mustChangePassword = true;
            await user.save();

            // Shown once to the superadmin; only the hash is stored
            res.json({
                success: true,
                data: { tempPassword }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to reset password'
            });
        }
    }
);
```

Before inserting, confirm the anchor with `grep -n "@route   DELETE /api/users/:id" server/routes/user.routes.js`.

- [ ] **Step 6: Run it to confirm delivery works**

Wait for nodemon to restart (`curl -s http://localhost:5000/api/health` returns 200). Then run the clear-counters command and the verification command.
Expected: checks 1, 2, 5, 6, 7, 8, 9 PASS; checks 3 and 4 FAIL, because enforcement is Task 2. Output ends with `2 check(s) failed`, and cleanup prints `-> 200`.

- [ ] **Step 7: Commit**

```bash
git add server/scripts/verify-temp-password.js server/models/User.js server/controllers/employee.controller.js server/routes/user.routes.js docs/superpowers/specs/2026-10-02-temp-password-design.md docs/superpowers/plans/2026-10-02-temp-password.md
git commit -m "feat: return temporary password on employee create and add superadmin reset"
```

---

### Task 2: Enforce the password change (server)

**Files:**
- Modify: `server/middleware/auth.js` (constant above `protect`; check after the `isActive` block)
- Modify: `server/routes/auth.routes.js` (validator chain of `router.put('/password'`)

**Interfaces:**
- Consumes: `mustChangePassword` on the user document (already exists).
- Produces: the 403 `PASSWORD_CHANGE_REQUIRED` response that Task 5's interceptor and route guard rely on.

- [ ] **Step 1: Confirm the failing checks**

Run the clear-counters command and the verification command.
Expected: checks 3 and 4 FAIL, everything else PASSES (same as Task 1, Step 6).

- [ ] **Step 2: Block flagged users in `protect`**

In `server/middleware/auth.js`, add above `// Protect routes - verify JWT token`:

```js
// The only requests a user on a temporary password may make
const PASSWORD_CHANGE_ALLOWED = new Set([
    'GET /api/auth/me',
    'PUT /api/auth/password',
    'POST /api/auth/logout'
]);
```

and inside `protect`, directly after the `if (!req.user.isActive) { ... }` block and before `return next();`, add:

```js
            if (req.user.mustChangePassword) {
                const path = req.originalUrl.split('?')[0];
                if (!PASSWORD_CHANGE_ALLOWED.has(`${req.method} ${path}`)) {
                    return res.status(403).json({
                        success: false,
                        code: 'PASSWORD_CHANGE_REQUIRED',
                        message: 'Password change required'
                    });
                }
            }
```

- [ ] **Step 3: Reject reusing the current password**

In `server/routes/auth.routes.js`, in the validator array of `router.put('/password'`, add a third entry after the existing `body('newPassword')...` chain:

```js
        body('newPassword')
            .custom((value, { req }) => value !== req.body.currentPassword)
            .withMessage('New password must be different from the current password'),
```

- [ ] **Step 4: Run it to confirm everything passes**

Wait for nodemon to restart, then run the clear-counters command and the verification command.
Expected: all 9 checks PASS, output ends with `all checks passed`, the exit code is 0, and cleanup prints `-> 200`.

- [ ] **Step 5: Commit**

```bash
git add server/middleware/auth.js server/routes/auth.routes.js
git commit -m "feat: block API access until a temporary password is changed"
```

---

### Task 3: Temporary-password modal and Add Employee (client)

**Files:**
- Create: `client/src/components/common/TempPasswordModal.jsx`
- Create: `client/src/components/common/TempPasswordModal.css`
- Modify: `client/src/pages/employees/EmployeeForm.jsx` (imports, state, `handleSubmit`, render)

**Interfaces:**
- Consumes: `POST /api/employees` 201 body `{ data: { _id, email, ... }, tempPassword }` (Task 1).
- Produces: `<TempPasswordModal email={string} password={string} onClose={() => void} />`, default export.

- [ ] **Step 1: Create the modal**

Create `client/src/components/common/TempPasswordModal.jsx`:

```jsx
import { createPortal } from 'react-dom';
import { FiCopy, FiKey } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './TempPasswordModal.css';

// Shows a generated temporary password once. Only the Done button closes it,
// so a stray backdrop click or Escape can't lose the password. Rendered into
// <body> so animated page containers can't affect its fixed positioning.
const TempPasswordModal = ({ email, password, onClose }) => {
    const handleCopy = () => {
        // navigator.clipboard is missing on plain-HTTP origins other than localhost
        if (!navigator.clipboard) {
            toast.error('Could not copy. Select the password and copy it manually.');
            return;
        }
        navigator.clipboard.writeText(password)
            .then(() => toast.success('Password copied to clipboard!'))
            .catch(() => toast.error('Could not copy. Select the password and copy it manually.'));
    };

    return createPortal(
        <div className="modal-overlay">
            <div className="modal temp-password-modal" role="dialog" aria-modal="true" aria-labelledby="temp-password-title">
                <div className="modal-header">
                    <h2 id="temp-password-title" className="modal-title">
                        <FiKey /> Temporary password
                    </h2>
                </div>
                <div className="modal-body">
                    <p>
                        Give this password to <strong>{email}</strong>. They will be asked to
                        choose a new one the first time they sign in.
                    </p>
                    <div className="temp-password-box">
                        <code>{password}</code>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopy}>
                            <FiCopy /> Copy
                        </button>
                    </div>
                    <p className="temp-password-warning">This password will not be shown again.</p>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default TempPasswordModal;
```

Create `client/src/components/common/TempPasswordModal.css`:

```css
.temp-password-modal .modal-title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.temp-password-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 16px 0 8px;
    padding: 12px 16px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
}

.temp-password-box code {
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 18px;
    letter-spacing: 1px;
    word-break: break-all;
    user-select: all;
}

.temp-password-warning {
    color: var(--warning);
    font-size: 13px;
}
```

- [ ] **Step 2: Show it after Add Employee**

In `client/src/pages/employees/EmployeeForm.jsx`, add the import after the `toast` import:

```jsx
import TempPasswordModal from '../../components/common/TempPasswordModal';
```

add state after `const [jdFile, setJdFile] = useState(null);`:

```jsx
    const [createdAccount, setCreatedAccount] = useState(null); // { email, tempPassword } after create
```

replace the whole `handleSubmit` function with:

```jsx
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            let employeeData = { ...formData };

            if (isEdit) {
                await employeeAPI.update(id, employeeData);

                // Upload JD file if selected
                if (jdFile) {
                    await employeeAPI.uploadJD(id, jdFile);
                }

                toast.success('Employee updated successfully');
                navigate('/employees');
            } else {
                const { data: created } = await employeeAPI.create(employeeData);
                toast.success('Employee created successfully');

                // Show the one-time password before anything else can fail
                if (created.tempPassword) {
                    setCreatedAccount({ email: created.data.email, tempPassword: created.tempPassword });
                }

                // Upload JD file if selected. The employee and account already
                // exist, so a failure here only warns
                if (jdFile && created.data._id) {
                    try {
                        await employeeAPI.uploadJD(created.data._id, jdFile);
                    } catch (uploadError) {
                        toast.error(uploadError.response?.data?.message || 'Employee created, but the JD upload failed');
                    }
                }

                if (!created.tempPassword) {
                    navigate('/employees');
                }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        } finally {
            setLoading(false);
        }
    };
```

and render the modal just before the component's final closing `</motion.div>` (after `</form>`):

```jsx
            {createdAccount && (
                <TempPasswordModal
                    email={createdAccount.email}
                    password={createdAccount.tempPassword}
                    onClose={() => navigate('/employees')}
                />
            )}
```

- [ ] **Step 3: Build**

Run: `cd client && npx vite build` (writes to `client/dist`, which is gitignored)
Expected: exit 0 and no errors. The existing >500 kB chunk warning is fine.

- [ ] **Step 4: Browser checks**

Start the client (`preview_start client`) with the backend running. Log in as `superadmin@company.com` (seed password), open `/employees/new`, fill employee ID `UI<timestamp>`, first/last name, email `ui<timestamp>@example.com`, a department, a position, and a salary, then click Create Employee.

1. A "Temporary password" modal appears showing that email and a 10-character password, over the page.
2. The URL is still `/employees/new`.
3. Click the backdrop corner, then press Escape. The modal is still open. (Review Focus 2)
4. Click Copy. The toast says "Password copied to clipboard!".
5. Run `Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })` in the page and click Copy again. The toast says "Could not copy...", the modal stays open, and the console has no uncaught error. (Review Focus 3)
6. Reload `/employees/new`. Before submitting a second employee (new ID and email), run this in the page to force the JD upload to fail:
   ```js
   const open = XMLHttpRequest.prototype.open;
   XMLHttpRequest.prototype.open = function (m, u, ...r) { return open.call(this, m, u.includes('upload-jd') ? '/api/__force_fail__' : u, ...r); };
   const input = document.querySelector('input[type=file]');
   const dt = new DataTransfer(); dt.items.add(new File(['%PDF-1.4 test'], 'jd.pdf', { type: 'application/pdf' }));
   input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
   ```
   Submit. An error toast about the JD upload appears, and the modal with the password still appears. (Review Focus 1)
7. Click Done. The app navigates to `/employees`.

Cleanup: delete both UI test employees (search `UI` on `/employees`, or `DELETE /api/employees/:id` as superadmin), then run the clear-counters command.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/common/TempPasswordModal.jsx client/src/components/common/TempPasswordModal.css client/src/pages/employees/EmployeeForm.jsx
git commit -m "feat: show the temporary password once after creating an employee"
```

---

### Task 4: Reset password on the Users page (client)

**Files:**
- Modify: `client/src/services/api.js` (`userAPI`)
- Modify: `client/src/pages/users/UserList.jsx` (imports, auth, state, mutation, handler, table, modal)
- Modify: `client/src/pages/users/UserList.css` (remove the dead `/* Password Cell */` rules)

**Interfaces:**
- Consumes: `POST /api/users/:id/reset-password` (Task 1); `TempPasswordModal` (Task 3).
- Produces: `userAPI.resetPassword(id: string) => Promise<AxiosResponse<{ success, data: { tempPassword } }>>`.

- [ ] **Step 1: API client**

In `client/src/services/api.js`, add to `userAPI` after the `delete` entry:

```js
    resetPassword: (id) => api.post(`/users/${id}/reset-password`),
```

- [ ] **Step 2: UserList changes**

In `client/src/pages/users/UserList.jsx`:

Replace the icon import's last line `FiUserCheck, FiUserX, FiMinusCircle, FiCopy, FiEye, FiEyeOff` with `FiUserCheck, FiUserX, FiMinusCircle, FiKey`. Add after the `userAPI, employeeAPI` import:

```jsx
import TempPasswordModal from '../../components/common/TempPasswordModal';
```

Replace `const { canManageUsers } = useAuth();` with:

```jsx
    const { canManageUsers, user: currentUser } = useAuth();
```

Replace `const [showPasswordFor, setShowPasswordFor] = useState(null); // Track which user's password is visible` with:

```jsx
    const [resetResult, setResetResult] = useState(null); // { email, tempPassword } after a reset
```

Add after the `unlinkMutation` block:

```jsx
    const resetPasswordMutation = useMutation({
        mutationFn: (user) => userAPI.resetPassword(user._id),
        onSuccess: ({ data }, user) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setResetResult({ email: user.email, tempPassword: data.data.tempPassword });
        },
        onError: (error) => toast.error(error.response?.data?.message || 'Failed to reset password')
    });
```

Replace the whole `copyToClipboard` function with:

```jsx
    const handleResetPassword = (user) => {
        if (!window.confirm(`Reset the password for ${user.email}? Their current password will stop working immediately.`)) {
            return;
        }
        resetPasswordMutation.mutate(user);
    };
```

In the table header, delete `<th>Initial Password</th>`. In the row, delete the whole `<td>` that starts with `{user.tempPassword ? (` and ends with the `<span className="text-muted">—</span>` fallback and its closing `</td>`.

In the row's `action-buttons`, insert between the Edit button and the activate/deactivate button:

```jsx
                                                {user._id !== currentUser?._id && (
                                                    <button
                                                        className="btn-icon"
                                                        onClick={() => handleResetPassword(user)}
                                                        disabled={resetPasswordMutation.isPending}
                                                        title="Reset password"
                                                    >
                                                        <FiKey />
                                                    </button>
                                                )}
```

Insert directly before `</AnimatePresence>` at the end of the component:

```jsx
                {resetResult && (
                    <TempPasswordModal
                        email={resetResult.email}
                        password={resetResult.tempPassword}
                        onClose={() => setResetResult(null)}
                    />
                )}
```

After editing, `grep -nE "tempPassword|showPasswordFor|copyToClipboard|FiEye|FiCopy" client/src/pages/users/UserList.jsx` must print only the `resetResult`/`TempPasswordModal` lines that use `tempPassword`.

- [ ] **Step 3: Remove the dead CSS**

In `client/src/pages/users/UserList.css`, delete the `/* Password Cell */` comment and the `.password-cell`, `.password-display`, and `.password-cell .btn-icon.btn-sm` rules. Keep `.text-muted`.

- [ ] **Step 4: Build**

Run: `cd client && npx vite build` (writes to `client/dist`, which is gitignored)
Expected: exit 0 and no errors.

- [ ] **Step 5: Browser checks**

Create a throwaway employee as superadmin through the API (`POST /api/employees`, as in the script's check 1) and note its email. Do not reset any seed account. In the browser, logged in as superadmin, open `/users`.

1. There is no "Initial Password" column.
2. The superadmin's own row has no key button; the other rows do.
3. Run `window.confirm = () => true` in the page (the automated browser can't answer native dialogs), then click the key button on the throwaway user's row. The modal shows that email and a new password.
4. Backdrop click and Escape don't close it; Done does, and the table is still there.

Cleanup: delete the throwaway employee (`DELETE /api/employees/:id`), then run the clear-counters command.

- [ ] **Step 6: Commit**

```bash
git add client/src/services/api.js client/src/pages/users/UserList.jsx client/src/pages/users/UserList.css
git commit -m "feat: add superadmin password reset to the Users page"
```

---

### Task 5: Forced change-password screen (client)

**Files:**
- Create: `client/src/pages/auth/ChangePassword.jsx`
- Modify: `client/src/context/AuthContext.jsx` (add `markPasswordChanged`)
- Modify: `client/src/App.jsx` (imports, `ProtectedRoute`, new route)
- Modify: `client/src/services/api.js` (response interceptor)

**Interfaces:**
- Consumes: the 403 `PASSWORD_CHANGE_REQUIRED` response (Task 2); `user.mustChangePassword` from `/auth/login` and `/auth/me`.
- Produces: `useAuth().markPasswordChanged(): void`; route `/change-password`.

- [ ] **Step 1: AuthContext helper**

In `client/src/context/AuthContext.jsx`, add after the `logout` function:

```jsx
    // Clears the temporary-password flag locally after a successful change
    const markPasswordChanged = () => {
        setUser(prev => (prev ? { ...prev, mustChangePassword: false } : prev));
    };
```

and add `markPasswordChanged,` to the provider `value` after `logout,`.

- [ ] **Step 2: Change-password page**

Create `client/src/pages/auth/ChangePassword.jsx`:

```jsx
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiKey, FiLock, FiLogOut } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './Auth.css';

// Same rule the server enforces: 8+ characters with upper, lower and a number
const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const fields = [
    { name: 'currentPassword', label: 'Temporary Password', placeholder: 'Enter the temporary password', autoComplete: 'current-password' },
    { name: 'newPassword', label: 'New Password', placeholder: 'At least 8 characters', autoComplete: 'new-password' },
    { name: 'confirmPassword', label: 'Confirm New Password', placeholder: 'Re-enter the new password', autoComplete: 'new-password' }
];

const ChangePassword = () => {
    const navigate = useNavigate();
    const { user, logout, markPasswordChanged } = useAuth();
    const [formData, setFormData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [showPasswords, setShowPasswords] = useState(false);
    const [loading, setLoading] = useState(false);

    // Only accounts on a temporary password belong here
    if (!user?.mustChangePassword) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        const { currentPassword, newPassword, confirmPassword } = formData;

        if (!passwordRule.test(newPassword)) {
            toast.error('Password must be at least 8 characters with an uppercase letter, a lowercase letter and a number');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        if (newPassword === currentPassword) {
            toast.error('New password must be different from the temporary password');
            return;
        }

        setLoading(true);
        try {
            await authAPI.changePassword({ currentPassword, newPassword });
            markPasswordChanged();
            toast.success('Password changed');
            navigate('/dashboard', { replace: true });
        } catch (error) {
            const data = error.response?.data;
            toast.error(data?.errors?.[0]?.message || data?.message || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    return (
        <div className="auth-page">
            <div className="auth-background">
                <div className="gradient-blob blob-1"></div>
                <div className="gradient-blob blob-2"></div>
                <div className="gradient-blob blob-3"></div>
            </div>

            <motion.div
                className="auth-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="auth-header">
                    <div className="auth-logo">
                        <FiKey />
                    </div>
                    <h1>Set a New Password</h1>
                    <p>{user.email} is signed in with a temporary password. Choose a new one to continue.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {fields.map(({ name, label, placeholder, autoComplete }) => (
                        <div className="form-group" key={name}>
                            <label className="form-label" htmlFor={name}>{label}</label>
                            <div className="input-wrapper">
                                <FiLock className="input-icon" />
                                <input
                                    id={name}
                                    type={showPasswords ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder={placeholder}
                                    autoComplete={autoComplete}
                                    value={formData[name]}
                                    onChange={(e) => setFormData({ ...formData, [name]: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                    ))}

                    <label className="checkbox-wrapper">
                        <input
                            type="checkbox"
                            checked={showPasswords}
                            onChange={(e) => setShowPasswords(e.target.checked)}
                        />
                        <span>Show passwords</span>
                    </label>

                    <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={loading}>
                        {loading ? (
                            <div className="loading-spinner" style={{ width: 20, height: 20 }}></div>
                        ) : (
                            'Change Password'
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                        <FiLogOut /> Log out
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default ChangePassword;
```

- [ ] **Step 3: Route guard and route**

In `client/src/App.jsx`, change the router import to:

```jsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
```

add after `import Register from './pages/auth/Register';`:

```jsx
import ChangePassword from './pages/auth/ChangePassword';
```

replace the `ProtectedRoute` component with:

```jsx
// Protected Route Component
const ProtectedRoute = ({ children, roles }) => {
    const { user, loading, isAuthenticated } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Users on a temporary password must change it before anything else
    if (user.mustChangePassword && location.pathname !== '/change-password') {
        return <Navigate to="/change-password" replace />;
    }

    if (roles && !roles.includes(user.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};
```

and add after the `/register` route:

```jsx
            <Route path="/change-password" element={
                <ProtectedRoute>
                    <ChangePassword />
                </ProtectedRoute>
            } />
```

- [ ] **Step 4: Interceptor safety net**

In `client/src/services/api.js`, inside the response interceptor's error handler, add directly after the closing brace of the `if (error.response?.status === 401) { ... }` block:

```js
        if (error.response?.status === 403 && error.response.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
            if (!window.location.pathname.startsWith('/change-password')) {
                window.location.href = '/change-password';
            }
        }
```

- [ ] **Step 5: Build**

Run: `cd client && npx vite build` (writes to `client/dist`, which is gitignored)
Expected: exit 0 and no errors.

- [ ] **Step 6: Browser checks**

Create a throwaway employee as superadmin through the API and note its email and `tempPassword`. In the browser, log out, then log in with that email and temporary password.

1. After Sign In, the URL is `/change-password` and the "Set a New Password" card shows the email.
2. Navigate to `/dashboard`, then `/employees`. Each time the URL ends up back at `/change-password`, with no flicker loop and no console errors about maximum update depth. (Review Focus 4)
3. Reload `/change-password`. It stays on `/change-password`. (Review Focus 4)
4. Submit a mismatched confirmation ("Passwords do not match"), then the temporary password as the new one ("must be different"). The URL stays on `/change-password`.
5. Click the card's Log out button. The URL becomes `/login`. Log in again with the same email and temporary password; the URL is `/change-password` again.
6. Submit a valid new password (e.g. `Newpass1x`). The toast says "Password changed", the dashboard loads with sidebar data, and the network panel shows no 403s.
7. Navigate to `/change-password` again. It redirects to `/dashboard`. (Review Focus 4)

This task makes 4 logins in total (superadmin for the API, the employee twice, superadmin again for cleanup), within the limit of 5.

Cleanup: log back in as superadmin, delete the throwaway employee, then run the clear-counters command.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/auth/ChangePassword.jsx client/src/context/AuthContext.jsx client/src/App.jsx client/src/services/api.js
git commit -m "feat: force users on a temporary password to change it"
```

---

### Task 6: Final verification

**Files:** none changed.

- [ ] **Step 1: Server verification**

Run the clear-counters command and the verification command.
Expected: all 9 checks PASS and `all checks passed`.

- [ ] **Step 2: Client build**

Run: `cd client && npx vite build` (writes to `client/dist`, which is gitignored)
Expected: exit 0.

- [ ] **Step 3: Leftovers and state**

Run:

```bash
docker exec ems-mongo mongosh employee_management --quiet --eval 'print("test employees: " + db.employees.countDocuments({employeeId: /^(TMP|UI)\d+$/}) + ", totals: " + db.employees.countDocuments() + " employees, " + db.users.countDocuments() + " users")'
git status --short
git log --oneline -6
```

Expected: `test employees: 0`, totals `100 employees, 5 users`, a clean working tree apart from `.claude/`, and the five task commits on top of `685d34b`. Clear the rate-limit counters one last time. Pushing waits for the user.
