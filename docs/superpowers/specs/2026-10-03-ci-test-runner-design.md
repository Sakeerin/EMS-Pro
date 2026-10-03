# Self-Contained Test Runner and GitHub Actions CI — Design

Date: 2026-10-03
Status: Approved in chat, awaiting written-spec review

## Problem

The server has 22 verification scripts (`server/scripts/verify-*.js`, 121 checks) that exercise the real API. They are run by `npm test` (`server/scripts/run-verify.js`), which:

- needs the developer to start the API first (`npm run dev` on port 5000), with MongoDB (replica set `rs0`) and Redis running and the demo data seeded;
- runs against the developer's own database (`employee_management`). The scripts create throwaway records and delete them, but a script that crashes midway can leave data behind, and the runner shares the dev Redis (login rate limits, cached dashboard stats);
- runs only when someone remembers to run it. There is no CI: nothing checks a push to `main` or a pull request, and nothing checks that the client still builds.

## Decisions (from the user)

1. **CI checks every push to `main` and every pull request into `main`** and reports pass/fail (status checks and a README badge). Pushing straight to `main` stays allowed; no branch protection.
2. **Scope: the API verification scripts plus a client build.** No ESLint setup.
3. **Approach A: a self-contained runner.** `npm test` creates its own isolated environment (test database, test Redis database, its own API process), runs the existing scripts unchanged, and cleans up. The same command runs locally and in CI. Rewriting the checks as in-process tests (node:test, supertest, mongodb-memory-server) was considered and rejected as too large and too risky; a CI-only YAML wrapper was rejected because it can't be run locally and leaves local runs on the dev database.

## Success criteria

- `npm test` in `server/` passes all scripts without `npm run dev` running, and leaves the dev database `employee_management` unchanged (same document counts before and after; no `employee_management_test` left behind).
- `npm test` also works while the dev server is running; the two don't interfere.
- A push to `main` shows a green check on GitHub with two jobs (server tests, client build), and the README shows the CI badge.
- When a check fails, CI goes red and its log names the failing script and shows its output and the tail of the API log.

## Runner: `server/scripts/run-verify.js`

### Isolated environment

| Setting | Default | Override |
|---------|---------|----------|
| Test database | `MONGODB_URI` from `.env` with its database name replaced by `employee_management_test` (query string such as `?replicaSet=rs0` kept) | `TEST_MONGODB_URI` |
| Test Redis | `REDIS_URL` from `.env` (default `redis://localhost:6379`) with its path set to logical database `/15` (replacing any database number it had) | `TEST_REDIS_URL` |
| Test API port | `5055` | `TEST_PORT` |
| JWT secret | `JWT_SECRET` from the environment / `.env` | — |

Safety guard: the runner refuses to start (exit 2) unless the test database name ends in `_test`, because the seed step deletes every user, employee and department in the database it is given.

Login rate limits and the cached dashboard stats live in Redis, so test database 15 keeps them apart from the dev server's. Uploaded avatars and job descriptions still go to `server/uploads/` as today; the scripts that upload delete their own files.

### Sequence

1. **Preflight** (exit 2 with a hint on failure): parse filters (`npm test -- leave` keeps working); check MongoDB is reachable at the test URI and Redis at the test Redis URL; check the test port is free.
2. **Clean start:** drop the test database and flush test Redis database 15, so leftovers from an interrupted run never matter.
3. **Seed:** run `scripts/seed.js` with `MONGODB_URI` set to the test URI. On failure, print the seed output and exit 2.
4. **Start the API:** spawn `node server.js` from `server/` with `MONGODB_URI`, `REDIS_URL` and `PORT` set to the test values (and `NODE_ENV=test`). Capture its stdout/stderr to an in-memory buffer (last ~200 lines). Wait up to 30 s for `GET /api/health` to return 200; otherwise print the API log and exit 2.
5. **Run the scripts** exactly as today (sorted, `verify-login-rate-limit.js` last, rate-limit keys cleared before each, 5-minute timeout each), passing `API_URL=http://localhost:<port>/api`, `MONGODB_URI=<test URI>` and `REDIS_URL=<test Redis URL>` in each child's environment. The scripts need no changes for this: they read `API_URL` and `MONGODB_URI` from the environment, and `dotenv` does not override variables that are already set. `verify-user-password-hook.js` keeps using its own throwaway `ems_verify_*` database.
   One script change: `verify-security-fixes.js` check 5 requests an upload through the Vite dev server, whose proxy points at the dev API (port 5000), not the test API. The runner also passes `VERIFY_DEV_PROXY=off`, and the script prints `SKIP` for that check when it sees it, so `npm test` passes whether or not the Vite dev server is running. Run on its own against the dev setup, the script still makes the check.
6. **On a failing script:** print its output (as today) followed by the last lines of the API log, and mark the run failed.
7. **Clean up (always):** stop the API process, drop the test database, flush test Redis database 15, close connections. This runs on success, on failure, and on `SIGINT`/`SIGTERM` (Ctrl+C), so no stray API process keeps the port.
8. **Summary and exit code:** the existing summary line; exit 0 when every script passed, 1 when any failed, 2 for setup problems.

### Developer workflow after the change

- `npm test` — full isolated run (Docker MongoDB and Redis must be running, as today; the dev server doesn't need to be).
- `npm test -- leave` — only scripts whose name contains "leave", still isolated.
- `node scripts/verify-xxx.js` — runs one script against the dev server and dev database, as today (useful while debugging with `npm run dev`).

## CI: `.github/workflows/ci.yml`

- **Triggers:** `push` to `main`; `pull_request` targeting `main`. `concurrency` grouped by workflow and ref with `cancel-in-progress: true`.
- **Job `server-tests`** (`ubuntu-latest`, `timeout-minutes: 15`, working directory `server`):
  - Redis 7 as a service container on port 6379.
  - MongoDB 7 started with `docker run -d -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all` (service containers can't take `--replSet`), then `rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]})` and a wait loop until `rs.status().members[0].stateStr` is `PRIMARY`.
  - `actions/setup-node` with Node 20 and npm cache keyed on `server/package-lock.json`; `npm ci`.
  - Write `server/.env` with `MONGODB_URI=mongodb://localhost:27017/employee_management?replicaSet=rs0`, `REDIS_URL=redis://localhost:6379` and `JWT_SECRET` from `openssl rand -hex 64` (fresh per run; no GitHub secret needed).
  - `npm test`.
- **Job `client-build`** (`ubuntu-latest`, in parallel, working directory `client`): Node 20 with npm cache keyed on `client/package-lock.json`; `npm ci`; `npm run build`.
- The `verify-security-fixes.js` check of the Vite dev-server proxy prints `SKIP` under `npm test` (see the runner's step 5); this is not a failure.

## README

- CI status badge at the top.
- Verification Scripts section: `npm test` now creates its own test database/Redis database/API (no need to start the dev server); list the `TEST_*` overrides; note that CI runs the same command plus a client build on every push and pull request to `main`.

## Testing this change

Locally:
1. With the dev server stopped: `npm test` passes all 22 scripts.
2. Record document counts in `employee_management` before and after; they must match, and `employee_management_test` must not exist afterwards.
3. With the dev server running: `npm test` passes too, and the dev server keeps working.
4. `TEST_MONGODB_URI` pointing at a database not ending in `_test` makes the runner refuse with exit 2.
5. Interrupting a run (Ctrl+C) leaves no process listening on the test port.

On GitHub:
6. After pushing to `main`, both jobs are green.
7. A deliberately failing check on a temporary branch and pull request turns CI red and the log names the script; then close the pull request and delete the branch. (Remote action: confirm with the user first.)

## Out of scope

Rewriting the checks as in-process tests, ESLint, branch protection, deployment, and splitting `app.js` out of `server.js` (not needed when the runner starts the API as a separate process).
