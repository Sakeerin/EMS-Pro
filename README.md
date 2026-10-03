# Employee Management System - MERN Stack

A modern, comprehensive Employee Management System built with MongoDB, Express.js, React, and Node.js.

## ✨ Features

### 🔐 Authentication & Authorization
- JWT-based authentication (httpOnly cookie)
- Role-based access control (SuperAdmin, Admin, HR, Employee)
- Secure password hashing with bcrypt
- One-time temporary passwords for new accounts, superadmin password reset, and a forced password change on first sign-in
- Login rate limiting that counts failed attempts only (per account and per IP), backed by Redis

### 👥 Employee Management
- Complete CRUD operations
- Profile with photo upload
- Department assignment
- Search by any part of a name, email or employee ID (every word must match), plus department and status filters

### ⏰ Attendance Tracking
- Real-time check-in/check-out
- Working hours calculation, with an unpaid 1-hour lunch break taken out of any day longer than 5 hours
- Overtime (hours beyond 8) waits for HR/admin approval on the Attendance page; nobody approves their own
- Attendance reports

### 🏖️ Leave Management
- Multiple leave types (annual, sick, personal)
- Approval workflow
- Leave balance tracking per calendar year: each request counts against the quota of the year it falls in (`GET /api/leaves/balance?year=` reads any year)
- A request stays within one calendar year (split year-end leave into two requests) and can be dated from last year to next year

### 💰 Payroll
- Salary management
- Automatic payroll calculation for any of the last 24 months; only approved overtime is paid, so approve overtime before generating (the result says how many entries were still pending)
- Draft → approved → paid workflow; before approval, `PUT /api/payroll/:id` can adjust the bonus, allowances, tax, provident fund and other deductions, notes and payment method (totals are recalculated); nobody changes, approves or pays their own payroll
- Payslip generation

### 📊 Dashboard
- Real-time KPIs
- Interactive charts
- Recent activities

### 🎨 Modern UI/UX
- Glassmorphism design
- Dark/Light theme
- Smooth animations
- Fully responsive

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Docker, to run MongoDB and Redis locally (or a MongoDB Atlas cluster)

Commands below are for a bash shell (macOS/Linux, or Git Bash on Windows).

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Start MongoDB and Redis

**MongoDB must run as a replica set.** Creating, updating and deleting employees use MongoDB transactions, which a standalone server rejects ("Transaction numbers are only allowed on a replica set member or mongos"), so those requests fail with a 500. A single-node replica set is enough:

```bash
docker run -d --name ems-mongo -p 27017:27017 -v ems-mongo-data:/data/db mongo:7 --replSet rs0 --bind_ip_all
docker exec ems-mongo mongosh --quiet --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]})'
```

Run `rs.initiate` once, when the container is first created; the replica set configuration is stored in the volume. Check it with `docker exec ems-mongo mongosh --quiet --eval 'rs.status().members[0].stateStr'`, which should print `PRIMARY`.

**Redis** is optional but recommended. It backs the dashboard cache and keeps login rate limits across restarts and instances. Without it the server falls back to in-memory rate limiting.

```bash
docker run -d --name ems-redis -p 6379:6379 -v ems-redis-data:/data redis:7
```

Already have a standalone `ems-mongo` container? Recreate it as a replica set on the same volume; your data is kept:

```bash
docker stop ems-mongo && docker rm ems-mongo
docker run -d --name ems-mongo -p 27017:27017 -v ems-mongo-data:/data/db mongo:7 --replSet rs0 --bind_ip_all
docker exec ems-mongo mongosh --quiet --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]})'
```

**Using MongoDB Atlas instead:** Atlas clusters are replica sets already, so just use the connection string Atlas gives you as `MONGODB_URI`.

### 3. Configure the server

```bash
cp server/.env.example server/.env
```

Then edit `server/.env`:

| Variable | Required | Example / default | Notes |
|----------|----------|-------------------|-------|
| `MONGODB_URI` | yes | `mongodb://localhost:27017/employee_management?replicaSet=rs0` | For Atlas, use the `mongodb+srv://` string from Atlas |
| `JWT_SECRET` | yes | — | Generate one: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRE` | no | `7d` | Token lifetime |
| `PORT` | no | `5000` | API port |
| `NODE_ENV` | no | `development` | Use `production` in production (secure cookies) |
| `CLIENT_URL` | no | `http://localhost:5173` | Allowed CORS origin |
| `REDIS_URL` | no | `redis://localhost:6379` | Default shown |
| `TRUST_PROXY` | no | unset | Only when behind a reverse proxy, see [Deployment notes](#-deployment-notes) |

### 4. Load demo data (optional)

```bash
cd server && npm run seed
```

> ⚠️ `npm run seed` **deletes all users, employees and departments** before inserting the demo data. Never run it against a database you want to keep.

It creates 10 departments, 100 employees and these accounts: `superadmin@company.com`, `admin@company.com`, `hr@company.com`, `manager.backend1@company.com` and `dev1@company.com`. Their shared demo password is printed at the end of the seed run and defined in `server/scripts/seed.js`.

### 5. Run the app

```bash
cd server && npm run dev    # API on http://localhost:5000/api
cd client && npm run dev    # app on http://localhost:5173 (proxies /api to port 5000)
```

To try a production build locally (pages are split into separate files that load on first visit):

```bash
cd client && npm run build && npm run preview    # http://localhost:4173, also proxies /api to port 5000
```

### Day to day

```bash
docker start ems-mongo ems-redis
```

Then start the server and client as in step 5.

### First-time setup without demo data

There is no self-registration: accounts are created by HR (adding an employee creates their account) or by a SuperAdmin on the Users page. To create the first SuperAdmin:

1. From `server/`, run:
   ```bash
   npm run create-superadmin -- you@example.com
   ```
   It prints a temporary password once.
2. Sign in with it; you'll be asked to choose a new password.
3. Create departments at `/departments`, then add employees at `/employees/new`.

## 🔑 Accounts and Passwords

- **New employees:** adding an employee also creates their user account with a random temporary password. It is shown **once**, in a dialog, to whoever created the employee, and only its hash is stored. Copy it and give it to the employee.
- **Lost or forgotten passwords:** a SuperAdmin can reset any other account from the **Users** page. The new temporary password is shown once in the same dialog. To change your own password, use **Settings**.
- **First sign-in:** an account on a temporary password is sent to `/change-password` and can't use any other part of the app (or the API) until it sets a new password.
- **Login rate limits:** 5 failed attempts per account per IP, and 50 failed attempts per IP across all accounts, per 15 minutes. Successful logins don't count. To clear the limits during development:
  ```bash
  docker exec ems-redis sh -c "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del"
  ```

## 🧪 Verification Scripts

These scripts exercise the real API end to end. With the API running on port 5000 (`npm run dev`), MongoDB and Redis up, and the demo data loaded, run them all from `server/`:

```bash
npm test               # every script, with a pass/fail summary
npm test -- leave      # only scripts whose name contains "leave"
```

`npm test` resets the login rate limits in Redis before each script (and at the end), runs `verify-login-rate-limit.js` last, prints the full output of any script that fails, and exits non-zero if one does. Each script can also be run on its own:

| Script | What it checks |
|--------|----------------|
| `node scripts/verify-temp-password.js` | Temporary password on create, forced change, superadmin reset and its guards |
| `node scripts/verify-employee-optional-fields.js` | Creating and editing employees with blank optional fields (gender, manager) |
| `node scripts/verify-login-rate-limit.js` | Login limits: only failures count, per account+IP and per IP |
| `node scripts/verify-dashboard-cache.js` | Dashboard stats cache is refreshed after successful writes (needs Redis) |
| `node scripts/verify-leave-rules.js` | Leave rules: employees cancel pending or not-yet-started approved leave (HR can cancel any), no approving or rejecting your own request, no overlapping requests |
| `node scripts/verify-leave-dates.js` | Leave quotas per year of the request (and `?year=` on the balance), 31 December counted, no request across two years or outside last year..next year, YYYY-MM-DD dates only, huge ranges refused at once |
| `node scripts/verify-leave-requests.js` | Leave requests: create, weekend-only and over-balance rejections, approve, reject, cancel |
| `node scripts/verify-overtime.js` | Lunch hour deducted from long days, overtime pending until an HR role approves it (not their own), payroll pays approved overtime only (writes test attendance through MongoDB; skips the payroll check if January 2001 already has payroll) |
| `node scripts/verify-payroll-updates.js` | Payroll edits limited to adjustments (bonus, allowances, tax/provident fund/other deductions, notes, payment method) with totals recalculated, draft → approved → paid with no skipping or going back, no edits after approval, nobody edits/approves/pays their own payroll, version-checked saves (writes test payroll through MongoDB) |
| `node scripts/verify-attendance-and-status.js` | Only HR/admin roles can record attendance for someone else; terminating or deactivating an employee blocks their login (and open sessions), reactivating allows it again |
| `node scripts/verify-access-control.js` | Employees see only their own record (no list, stats or colleagues' salary/bank data), list size capped, self-registration closed, profile-less accounts see no leave requests |
| `node scripts/verify-query-params.js` | Malformed list filters (bad IDs, dates, page/limit/month/year, `?a[$op]=` objects, repeated keys) get a 400 instead of a 500, user search is literal text, and the parameters the app sends still work |
| `node scripts/verify-employee-search.js` | Employee search finds part of a name, email or ID in any case, needs every word to match (any order), treats the text literally, and keeps the filters and totals |
| `node scripts/verify-write-errors.js` | Employee and department forms get a 400 with the reason (invalid value, duplicate ID/email/name/code) instead of a 500 |
| `node scripts/verify-avatar-upload.js` | Only the employee themself or HR/admin roles can change an avatar; rejected uploads write no file |
| `node scripts/verify-security-fixes.js` | Upload access (login required, JD files only for their employee and HR roles), random upload names, the `/uploads` dev proxy, id validation and own-account guards |
| `node scripts/verify-user-password-hook.js` | Password hashing hook leaves unchanged passwords alone (talks to MongoDB directly, using a throwaway `ems_verify_*` database; no API needed) |

Each script clears its own test data. When running scripts one by one, clear the `rl:*` keys in Redis (command above) between runs and after `verify-login-rate-limit.js`, which leaves your IP rate limited; `npm test` does this for you.

## 🚢 Deployment Notes

- **Behind a reverse proxy** (nginx, a load balancer, etc.), set `TRUST_PROXY` to the number of proxy hops (usually `1`) or the proxy's address/subnet. Otherwise every user appears to come from the proxy's IP and they all share one login limit. Leave it unset when there's no proxy: trusting `X-Forwarded-For` without one lets clients spoof their IP.
- Set `NODE_ENV=production` so auth cookies are sent with `Secure`, and use a strong, unique `JWT_SECRET`.
- Uploaded files (`/uploads/...`) are served by the API and require the login cookie; job description files are further limited to their employee and HR/admin roles. Route both `/api` and `/uploads` to the API on the same site as the frontend (the Vite dev server does this for you), or avatars and JD links won't load.
- The client build splits each page into its own file under `assets/`, with a content hash in the name. Serve `index.html` with `Cache-Control: no-cache` (the hashed files can be cached for a long time) and keep the previous build's `assets/` around for a while after a deploy if you can. A tab opened before a deploy that asks for a page file that no longer exists reloads itself once to pick up the new build.
- Point `REDIS_URL` at your Redis instance so rate limits are shared between server instances.
- Attendance saved before overtime approval was introduced keeps its old hours (lunch not deducted) and has no approval status, so its overtime is never paid. Generate payroll for those months before upgrading, or adjust them by hand.
- Existing accounts that were created by a SuperAdmin on the Users page are flagged to change their password, so they are sent to `/change-password` at their next request. Employees created before temporary passwords were introduced never received one; reset them from the Users page.

## 📁 Project Structure

```
Employee-Management-System/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/    # Layout and shared components
│   │   ├── context/       # React Context (auth, theme)
│   │   ├── pages/         # Route pages
│   │   ├── services/      # API client
│   │   └── styles/        # Global CSS
│   └── package.json
│
├── server/                 # Express Backend
│   ├── config/            # MongoDB and Redis connections
│   ├── controllers/       # Route handlers
│   ├── middleware/        # Auth middleware
│   ├── models/            # Mongoose models
│   ├── routes/            # API routes
│   ├── scripts/           # Seed and verification scripts
│   ├── services/          # File storage service
│   └── package.json
│
├── docs/                   # Design notes and plans
└── README.md
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Styling | Custom CSS + Framer Motion |
| State | React Context + React Query |
| Backend | Node.js + Express.js |
| Database | MongoDB (replica set) + Mongoose |
| Cache & rate limiting | Redis |
| Auth | JWT + bcrypt |
| Charts | Recharts |

## 📱 Screenshots

The application features:
- Modern login page with animated background
- Dashboard with KPI cards and charts
- Employee list with search and filters
- Attendance clock widget
- Leave balance cards
- Payroll management with payslips
- Dark/Light theme toggle

## 📄 License

MIT License
