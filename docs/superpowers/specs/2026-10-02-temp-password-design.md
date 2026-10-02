# Temporary Password Delivery and Forced Change — Design

Date: 2026-10-02
Status: Approved in chat, awaiting written-spec review

## Problem

Employees created through "Add Employee" cannot log in:

- `createEmployee` generates a random password, stores only its hash, and never returns it. Nobody ever learns it.
- Commit 3006b65 stored a plaintext `tempPassword` so HR could view it; commit 52f24f4 correctly removed that field, but no replacement delivery path was built. The Users page still renders an "Initial Password" column from `user.tempPassword`, which the server no longer sends, so it always shows "—".
- There is no admin password reset.
- `mustChangePassword` is set on generated and admin-created accounts, but neither the server nor the client checks it, so nothing forces a change.
- The Settings page can change a password, but requires the current one.

## Decisions (from the user)

1. **Delivery: show once + reset.** The system generates the temporary password and shows it once to the person who created the employee (with a copy button). It is never stored in plaintext. Superadmin gets a "Reset password" action that generates a new temporary password and shows it once the same way.
2. **Enforcement: server and client.** While `mustChangePassword` is true, the server rejects every API call except the few needed to change the password, and the client sends the user to a change-password screen.

## Server

### `User.generateTempPassword()` (server/models/User.js)
A static next to the existing `validatePasswordStrength`. It moves the generator out of `employee.controller.js` unchanged (`crypto.randomBytes(4).toString('hex') + 'A1'`) so create and reset share one implementation.

### Create employee (server/controllers/employee.controller.js)
`createEmployee` uses `User.generateTempPassword()` and adds `tempPassword` to its 201 response next to the existing `userCreated` flag. Nothing else about the transaction changes.

### Reset password (server/routes/user.routes.js)
`POST /api/users/:id/reset-password`
- Superadmin only, through the router's existing `authorize('superadmin')`.
- `param('id').isMongoId()` + `validate`, as the other `/:id` routes do.
- 400 when `:id` is the caller's own account ("Use Settings to change your own password").
- 404 when the user doesn't exist.
- Otherwise: set `password` to a new temporary password (the existing pre-save hook hashes it), set `mustChangePassword = true`, save, and return `200 { success: true, data: { tempPassword } }`.

### Enforcement in `protect` (server/middleware/auth.js)
After the existing `isActive` check: if `req.user.mustChangePassword` and the request is not one of

- `GET /api/auth/me`
- `PUT /api/auth/password`
- `POST /api/auth/logout`

respond `403 { success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Password change required' }`. Matching uses `req.method` and the path of `req.originalUrl` without the query string. Because `protect` loads the user from the database on every request, a reset takes effect immediately for sessions already open.

### Change password (server/routes/auth.routes.js)
`PUT /api/auth/password` returns 400 "New password must be different from the current password" when `newPassword === currentPassword`. Otherwise a user could "change" back to the temporary password the creator saw. The existing flow already clears `mustChangePassword` on success.

## Client

### `TempPasswordModal` (client/src/components/common/TempPasswordModal.jsx, new)
Uses the global `.modal-overlay` / `.modal` classes from `styles/index.css`. Shows the account email, the password in a monospace box, a copy button (`navigator.clipboard`, toast on success), and the warning that it will not be shown again. One "Done" button closes it.

### Add Employee (client/src/pages/employees/EmployeeForm.jsx)
After a successful create (and the optional JD upload), open `TempPasswordModal` with `response.data.tempPassword` and the employee's email instead of navigating straight away. Closing the modal navigates to `/employees` as before. Editing an employee is unchanged.

### Users page (client/src/pages/users/UserList.jsx)
- Remove the "Initial Password" column, the `showPasswordFor` state, and any helpers only that column used.
- Add a "Reset password" action on every row except the current user's own. It asks for confirmation with `window.confirm`, calls `userAPI.resetPassword(id)`, then opens `TempPasswordModal` with the returned password.

### API client (client/src/services/api.js)
- `userAPI.resetPassword: (id) => api.post(\`/users/${id}/reset-password\`)`.
- The response interceptor gets a 403 branch: when `error.response.data.code === 'PASSWORD_CHANGE_REQUIRED'` and the path isn't already `/change-password`, set `window.location.href = '/change-password'`. This is a safety net; the route guard below handles the normal case.

### Change password page (client/src/pages/auth/ChangePassword.jsx, new)
- Route `/change-password`: requires login but renders outside `Layout`, because the sidebar and header would call APIs that now return 403. Styled like the login page (`Auth.css`).
- Fields: temporary (current) password, new password, confirm new password. It applies the same strength rule as the server and checks that the two new fields match. It submits through `authAPI.changePassword`.
- On success: update the auth user so `mustChangePassword` is false, then navigate to `/dashboard`. Also offers a Logout button.
- A logged-in user without the flag who opens `/change-password` is redirected to `/dashboard`.

### Route guard (client/src/App.jsx, client/src/context/AuthContext.jsx)
`ProtectedRoute` redirects to `/change-password` when `user.mustChangePassword` is true and the current path is anything else. `AuthContext` exposes a small helper to clear the flag locally after a successful change. The login page keeps navigating to `/dashboard`, and the guard redirects from there.

## Behaviour notes

- Only superadmin can reset passwords, because the Users page and `/api/users` are already superadmin-only. Superadmin, admin, and HR can create employees, so all three see the one-time password at creation.
- Accounts a superadmin creates on the Users page already get `mustChangePassword: true`; they will now be forced to change on first login, which matches the original intent.
- Seed accounts default to `mustChangePassword: false` and are unaffected.
- JWTs are not revoked on reset; the database flag blocks them instead, because `protect` reads it on every request.

## Out of scope

- Emailing invitations or set-password links (no SMTP in the project).
- Letting HR or admin reset passwords.
- Token revocation, password expiry, or password history.

## Testing

Server, as an integration script against the running API. Run it before implementation to confirm it fails, then it must fully pass:

1. Creating an employee returns 201 with a non-empty `tempPassword`.
2. Logging in as that employee with `tempPassword` succeeds.
3. As that employee, `GET /api/attendance/today` (protected, open to every role) returns 403 with `code: 'PASSWORD_CHANGE_REQUIRED'`, while `GET /api/auth/me` returns 200.
4. `PUT /api/auth/password` with the new password equal to the current one returns 400.
5. Changing to a valid new password returns 200, after which `GET /api/attendance/today` returns 200 and `GET /api/auth/me` reports `mustChangePassword: false`.
6. Superadmin `POST /api/users/:id/reset-password` returns 200 with a `tempPassword`. The previous password no longer logs in, the new temporary password does, and the account is flagged again.
7. Superadmin resetting their own account returns 400.
8. A non-superadmin (e.g. HR) calling the reset endpoint returns 403.
9. Cleanup: delete the test employee (and with it the linked user).

Client: `vite build` passes. A manual run in the browser: create an employee and see the modal; log in as that employee and land on `/change-password`; change the password and reach the dashboard; reset from the Users page and see the modal.
