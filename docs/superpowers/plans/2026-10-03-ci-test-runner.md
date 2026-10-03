# Self-Contained Test Runner and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm test` in `server/` run all verification scripts against its own seeded test database, test Redis database and API process, and run that plus a client build in GitHub Actions on every push and pull request to `main`.

**Architecture:** Two small helper modules under `server/scripts/lib/` (pure settings helpers, and starting/stopping the API child process) feed a rewritten `server/scripts/run-verify.js` that sets up the isolated environment, seeds it, starts the API, runs the existing `verify-*.js` scripts with test settings in their environment, and always cleans up. A GitHub Actions workflow starts MongoDB (replica set) and Redis, writes a throwaway `.env`, and runs the same `npm test`; a second job builds the client.

**Tech Stack:** Node.js (ESM), mongoose 8, redis (node-redis) 5, express-validator-based API under test, GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`), Docker `mongo:7` and `redis:7`.

**Spec:** `docs/superpowers/specs/2026-10-03-ci-test-runner-design.md`

## Global Constraints

- Test database name `employee_management_test`; test Redis logical database `15`; test API port `5055`; overrides `TEST_MONGODB_URI`, `TEST_REDIS_URL`, `TEST_PORT`.
- The runner refuses to start (exit 2) unless the test database name ends in `_test`.
- Runner exit codes: `0` all scripts passed, `1` a script failed, `2` the test environment couldn't be set up.
- API health wait: 30 s. Per-script timeout: 5 minutes (unchanged). `verify-login-rate-limit.js` still runs last; rate-limit keys still cleared before each script.
- Scripts are not modified, except `verify-security-fixes.js` honouring `VERIFY_DEV_PROXY=off`.
- CI: triggers `push` to `main` and `pull_request` into `main`; `concurrency` per workflow+ref with `cancel-in-progress: true`; Node 20; `server-tests` timeout 15 min, `client-build` timeout 10 min; `JWT_SECRET` from `openssl rand -hex 64` per run.
- Code style: ESM, 4-space indent, single quotes, short comments explaining why (match the existing scripts).
- Git: work on branch `ci/self-contained-tests`, one commit per task (end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Do not push or merge until the user says so.
- Never print credentials: don't echo full MongoDB/Redis URLs; print the database name and Redis host/db only.

## Review Focus

- `MONGODB_URI` shapes other than the local default: an Atlas `mongodb+srv://user:pass@cluster/?retryWrites=true` with no database path, several hosts (`mongodb://h1:27017,h2:27017/db?replicaSet=rs0`), no trailing slash. Expected: the test URI keeps scheme, credentials, hosts and options and only swaps the database name. (Task 1 test.)
- `REDIS_URL` with a password, `rediss://`, or an existing database number. Expected: same host and credentials, database `/15`. (Task 1 test.)
- Port 5055 already in use, e.g. by a test API left over from a killed run. Expected: exit 2 naming the port and `TEST_PORT`, before anything is seeded. (Task 3 step.)
- The API can't start, e.g. `JWT_SECRET` empty. Expected: exit 2 within ~30 s showing the API's own log ("Missing required environment variables"), and the test database is still dropped. (Task 3 step.)
- The Vite dev server is running while `npm test` runs. Expected: `verify-security-fixes.js` prints `SKIP 5 ...` instead of failing through the dev proxy (which points at port 5000). (Task 3 step.)

---

### Task 1: Test environment settings helpers

**Files:**
- Create: `server/scripts/lib/testEnv.js`
- Test: `server/scripts/verify-test-env.js` (a no-API self-check; `npm test` will pick it up like `verify-leave-test-dates.js`)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 3):
  - `TEST_DB_NAME = 'employee_management_test'`, `TEST_REDIS_DB = 15`, `TEST_PORT = 5055`
  - `testMongoUri(baseUri: string, name = TEST_DB_NAME): string` — throws `Error('MONGODB_URI is not a MongoDB connection string')` for anything else (the message never contains the URI)
  - `databaseName(uri: string): string` — `''` when the URI has no database path; throws the same error for non-MongoDB strings
  - `isTestDatabaseName(name: string): boolean` — true only when `name` ends in `_test`
  - `testRedisUrl(baseUrl: string, db = TEST_REDIS_DB): string`

- [ ] **Step 0: Create the branch**

```bash
cd /d/Projects/Employee-Management-System && git switch -c ci/self-contained-tests
```

- [ ] **Step 1: Write the failing self-check**

Create `server/scripts/verify-test-env.js`:

```js
// Checks the helpers that derive npm test's isolated settings from the dev
// ones (scripts/lib/testEnv.js): the test database keeps the connection's
// hosts, credentials and options and only changes the database name, the
// test Redis keeps host and credentials and uses database 15, and only
// databases named *_test count as test databases.
//
// Usage (from server/): node scripts/verify-test-env.js
// Needs no API or database.

import { databaseName, isTestDatabaseName, testMongoUri, testRedisUrl } from './lib/testEnv.js';

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

// [input, expected] pairs; reports the first mismatch
const table = (name, fn, cases) => {
    const wrong = cases.map(([input, expected]) => [input, expected, fn(input)]).filter(([, expected, got]) => got !== expected);
    check(name, wrong.length === 0,
        wrong.length ? wrong.slice(0, 2).map(([input, expected, got]) => `${input} -> ${got}, expected ${expected}`).join('; ') : `${cases.length} cases`);
};

// 1. Only the database name changes
table('1 test MongoDB URI', (uri) => testMongoUri(uri), [
    ['mongodb://localhost:27017/employee_management?replicaSet=rs0', 'mongodb://localhost:27017/employee_management_test?replicaSet=rs0'],
    ['mongodb://localhost:27017', 'mongodb://localhost:27017/employee_management_test'],
    ['mongodb://localhost:27017/', 'mongodb://localhost:27017/employee_management_test'],
    ['mongodb://h1:27017,h2:27017/ems?replicaSet=rs0', 'mongodb://h1:27017,h2:27017/employee_management_test?replicaSet=rs0'],
    ['mongodb+srv://user:p%40ss@cluster0.abc.mongodb.net/ems?retryWrites=true&w=majority', 'mongodb+srv://user:p%40ss@cluster0.abc.mongodb.net/employee_management_test?retryWrites=true&w=majority'],
    ['mongodb+srv://cluster0.abc.mongodb.net/?retryWrites=true', 'mongodb+srv://cluster0.abc.mongodb.net/employee_management_test?retryWrites=true']
]);

// 2. Reading the database name back, and the *_test guard
table('2 database name', (uri) => databaseName(uri), [
    ['mongodb://localhost:27017/employee_management_test?replicaSet=rs0', 'employee_management_test'],
    ['mongodb://localhost:27017/employee_management', 'employee_management'],
    ['mongodb+srv://cluster0.abc.mongodb.net/?retryWrites=true', '']
]);
table('3 only *_test names are test databases', (name) => isTestDatabaseName(name), [
    ['employee_management_test', true],
    ['ems_test', true],
    ['employee_management', false],
    ['my_test_data', false],
    ['', false]
]);

// 4. Redis: same host and credentials, database 15
table('4 test Redis URL', (url) => testRedisUrl(url), [
    ['redis://localhost:6379', 'redis://localhost:6379/15'],
    ['redis://localhost:6379/2', 'redis://localhost:6379/15'],
    ['redis://:secret@cache:6380/0', 'redis://:secret@cache:6380/15'],
    ['rediss://user:pw@host.example.com:6380', 'rediss://user:pw@host.example.com:6380/15']
]);

// 5. Anything that isn't a MongoDB connection string is refused without echoing it
let message = '';
try { testMongoUri('postgres://admin:hunter2@db/app'); } catch (err) { message = err.message; }
check('5 non-MongoDB URI refused', message !== '' && !message.includes('hunter2'), `message='${message}'`);

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /d/Projects/Employee-Management-System/server && node scripts/verify-test-env.js`
Expected: crashes with `Cannot find module '.../scripts/lib/testEnv.js'` (exit code non-zero).

- [ ] **Step 3: Write the helpers**

Create `server/scripts/lib/testEnv.js`:

```js
// Where `npm test` runs its throwaway copy of the app: a test database, a test
// Redis database and a test port, derived from the dev settings in .env so a
// test run never touches dev data.

export const TEST_DB_NAME = 'employee_management_test';
export const TEST_REDIS_DB = 15;
export const TEST_PORT = 5055;

// mongodb:// or mongodb+srv://, then credentials and one or more hosts, an
// optional /database and optional ?options. Not parsed with URL because
// several comma-separated hosts aren't a valid URL host
const MONGO_URI = /^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/([^?]*))?(\?.*)?$/;

const parseMongoUri = (uri) => {
    const match = MONGO_URI.exec(uri || '');
    // The URI may hold a password, so it isn't repeated in the message
    if (!match) throw new Error('MONGODB_URI is not a MongoDB connection string');
    return { prefix: match[1], database: match[2] || '', options: match[3] || '' };
};

// The same connection with only the database name replaced
export const testMongoUri = (baseUri, name = TEST_DB_NAME) => {
    const { prefix, options } = parseMongoUri(baseUri);
    return `${prefix}/${name}${options}`;
};

export const databaseName = (uri) => decodeURIComponent(parseMongoUri(uri).database);

// Seeding deletes everything in the database it's given, so only databases
// whose name says they're for tests may be used
export const isTestDatabaseName = (name) => /_test$/.test(name);

// The same Redis server and credentials, on another logical database
export const testRedisUrl = (baseUrl, db = TEST_REDIS_DB) => {
    const url = new URL(baseUrl);
    url.pathname = `/${db}`;
    return url.toString();
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /d/Projects/Employee-Management-System/server && node scripts/verify-test-env.js`
Expected: `PASS` on checks 1–5 and `all checks passed`, exit 0.

- [ ] **Step 5: Commit**

```bash
cd /d/Projects/Employee-Management-System && git add server/scripts/lib/testEnv.js server/scripts/verify-test-env.js && git commit -m "test: derive isolated test settings from the dev .env

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Start and stop the API as a child process

**Files:**
- Create: `server/scripts/lib/apiProcess.js`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 3):
  - `isPortFree(port: number): Promise<boolean>`
  - `startApi({ cwd: string, env: object, maxLines?: number }): { logTail(count = 40): string, hasExited(): boolean, stop(): Promise<void> }` — spawns `node server.js` in `cwd`; keeps the last `maxLines` (default 200) lines of stdout+stderr; kills the child if the parent process exits.
  - `waitForHealth(apiUrl: string, { timeoutMs = 30000, hasExited = () => false }): Promise<boolean>` — polls `GET <apiUrl>/health` every 500 ms; `true` on a 200, `false` on timeout or when `hasExited()` turns true.

- [ ] **Step 1: Write the failing smoke check**

This helper is exercised end to end by Task 3; here a one-off smoke check proves it alone. It starts the API on port 5056 against the *test* database name (it only calls `/health`, nothing is written). MongoDB and Redis must be running (`docker start ems-mongo ems-redis`).

Run:

```bash
cd /d/Projects/Employee-Management-System/server && node --input-type=module -e "
import dotenv from 'dotenv'; dotenv.config();
import { isPortFree, startApi, waitForHealth } from './scripts/lib/apiProcess.js';
import { testMongoUri, testRedisUrl } from './scripts/lib/testEnv.js';
const port = 5056;
console.log('free before:', await isPortFree(port));
const api = startApi({ cwd: process.cwd(), env: { ...process.env, PORT: String(port), MONGODB_URI: testMongoUri(process.env.MONGODB_URI), REDIS_URL: testRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379') } });
const healthy = await waitForHealth('http://localhost:' + port + '/api', { hasExited: api.hasExited });
console.log('healthy:', healthy, '| free while running:', await isPortFree(port));
console.log('log tail has startup line:', api.logTail().includes('Server running on port ' + port));
await api.stop();
console.log('exited:', api.hasExited(), '| free after stop:', await isPortFree(port));
"
```

Expected now: fails with `Cannot find module '.../scripts/lib/apiProcess.js'`.

- [ ] **Step 2: Write the helper**

Create `server/scripts/lib/apiProcess.js`:

```js
// Runs the API (node server.js) as a child process for npm test, keeping the
// tail of its output so a failing run can show what the API logged.

import { spawn } from 'child_process';
import net from 'net';

// True when nothing is listening on the port
export const isPortFree = (port) => new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port);
});

export const startApi = ({ cwd, env, maxLines = 200 }) => {
    const child = spawn(process.execPath, ['server.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = [];
    const keep = (chunk) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
            if (line) lines.push(line);
        }
        if (lines.length > maxLines) lines.splice(0, lines.length - maxLines);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);

    let exited = false;
    child.once('exit', () => { exited = true; });

    // Last resort if the runner dies without cleaning up (an uncaught error,
    // process.exit): don't leave an API holding the port
    const killOnExit = () => { if (!exited) child.kill(); };
    process.on('exit', killOnExit);

    return {
        logTail: (count = 40) => lines.slice(-count).join('\n'),
        hasExited: () => exited,
        stop: () => new Promise((resolve) => {
            process.off('exit', killOnExit);
            if (exited) return resolve();
            child.once('exit', () => resolve());
            child.kill();
            setTimeout(() => { if (!exited) child.kill('SIGKILL'); }, 5000).unref();
        })
    };
};

// Polls GET <apiUrl>/health until it answers 200, the API exits, or time runs out
export const waitForHealth = async (apiUrl, { timeoutMs = 30000, hasExited = () => false } = {}) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !hasExited()) {
        const status = await fetch(`${apiUrl}/health`).then((res) => res.status).catch(() => null);
        if (status === 200) return true;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
};
```

- [ ] **Step 3: Run the smoke check to verify it passes**

Run the same command as Step 1.
Expected:
```
free before: true
healthy: true | free while running: false
log tail has startup line: true
exited: true | free after stop: true
```

- [ ] **Step 4: Commit**

```bash
cd /d/Projects/Employee-Management-System && git add server/scripts/lib/apiProcess.js && git commit -m "test: start and stop the API as a child process for npm test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Self-contained `npm test`

**Files:**
- Modify (rewrite): `server/scripts/run-verify.js`
- Modify: `server/scripts/verify-security-fixes.js` (header comment and check 5)

**Interfaces:**
- Consumes: Task 1 `TEST_PORT`, `databaseName`, `isTestDatabaseName`, `testMongoUri`, `testRedisUrl`; Task 2 `isPortFree`, `startApi`, `waitForHealth`.
- Produces: `npm test` (= `node scripts/run-verify.js [filters...]`) with exit codes 0/1/2; environment passed to each script: `API_URL`, `MONGODB_URI`, `REDIS_URL`, `PORT`, `NODE_ENV=test`, `VERIFY_DEV_PROXY=off`.

- [ ] **Step 1: Record the failing behaviour**

Stop the dev API (the preview server named `server`, or any `npm run dev`), keep MongoDB and Redis running, then:

Run: `cd /d/Projects/Employee-Management-System/server && npm test; echo "exit $?"`
Expected (current runner): `API not reachable at http://localhost:5000/api. Start it with "npm run dev" ...` and `exit 2`.

Also record the dev data baseline for the later comparison:

```bash
docker exec ems-mongo mongosh employee_management --quiet --eval 'printjson(Object.fromEntries(db.getCollectionNames().sort().map(c => [c, db[c].countDocuments()])))'
```

Save the printed object (paste it into your notes; Step 5 compares against it).

- [ ] **Step 2: Let the security script skip the dev-proxy check under npm test**

In `server/scripts/verify-security-fixes.js`, replace the header lines

```js
// Usage (from server/): node scripts/verify-security-fixes.js
// API_URL defaults to http://localhost:5000/api, CLIENT_URL to
// http://localhost:5173. Uses the seed superadmin and creates throwaway
```

with

```js
// Usage (from server/): node scripts/verify-security-fixes.js
// API_URL defaults to http://localhost:5000/api, CLIENT_URL to
// http://localhost:5173. npm test sets VERIFY_DEV_PROXY=off: it runs its own
// API, which the dev server doesn't proxy to, so check 5 is skipped there.
// Uses the seed superadmin and creates throwaway
```

and replace check 5

```js
    // 5. The Vite dev server forwards /uploads to the API (skipped if it isn't running)
    const viaClient = await ownerClient.get(CLIENT + jdUrl).catch(() => null);
    if (viaClient === null) {
```

with

```js
    // 5. The Vite dev server forwards /uploads to the API (skipped if it isn't
    //    running, or under npm test, whose API the dev server doesn't proxy to)
    const viaClient = process.env.VERIFY_DEV_PROXY === 'off' ? null : await ownerClient.get(CLIENT + jdUrl).catch(() => null);
    if (process.env.VERIFY_DEV_PROXY === 'off') {
        console.log('SKIP  5 /uploads through the dev server (npm test runs its own API, which the dev server does not proxy to)');
    } else if (viaClient === null) {
```

(The rest of check 5 — the `else { check('5 ...') }` branch — stays as it is.)

- [ ] **Step 3: Rewrite the runner**

Replace the whole of `server/scripts/run-verify.js` with:

```js
// Runs every scripts/verify-*.js against a throwaway copy of the app: a test
// database and a test Redis database, freshly seeded, with the API started on
// its own port. Your dev database and dev server are never touched, and the
// dev server doesn't need to be running.
//
// Usage (from server/): npm test             run all scripts
//                       npm test -- leave    only scripts whose name contains "leave"
// Needs MongoDB (replica set) and Redis running. Settings come from .env;
// override them with TEST_MONGODB_URI, TEST_REDIS_URL and TEST_PORT.
// Exits 0 when every script passed, 1 when one failed, 2 when the test
// environment couldn't be set up.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createClient } from 'redis';
import { TEST_PORT, databaseName, isTestDatabaseName, testMongoUri, testRedisUrl } from './lib/testEnv.js';
import { isPortFree, startApi, waitForHealth } from './lib/apiProcess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');
dotenv.config({ path: path.join(SERVER_DIR, '.env') });

// Runs last: it leaves this machine's IP at the login limit
const LAST = 'verify-login-rate-limit.js';

// A problem with the test environment rather than a failing check
class SetupError extends Error {}

const indent = (text) => text.trimEnd().split('\n').map((line) => `    ${line}`).join('\n');

let mongo = null;
let redis = null;
let api = null;
let cleanedUp = false;

// Always leaves nothing behind: no API process, no test data
const cleanUp = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (api) await api.stop();
    if (mongo) {
        await mongo.dropDatabase().catch(() => {});
        await mongo.close().catch(() => {});
    }
    if (redis) {
        await redis.flushDb().catch(() => {});
        await redis.quit().catch(() => {});
    }
};

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        console.error(`\n${signal} received: stopping the test API and removing test data`);
        await cleanUp();
        process.exit(130);
    });
}

const settings = () => {
    if (!process.env.TEST_MONGODB_URI && !process.env.MONGODB_URI) {
        throw new SetupError('Set MONGODB_URI in server/.env (or TEST_MONGODB_URI) so the test database can be found.');
    }
    const mongoUri = process.env.TEST_MONGODB_URI || testMongoUri(process.env.MONGODB_URI);
    const dbName = databaseName(mongoUri);
    if (!isTestDatabaseName(dbName)) {
        throw new SetupError(`Refusing to use database "${dbName}": the test database name must end in _test, because seeding deletes everything in it.`);
    }
    const redisUrl = process.env.TEST_REDIS_URL || testRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379');
    const port = Number(process.env.TEST_PORT) || TEST_PORT;
    return { mongoUri, dbName, redisUrl, port, apiUrl: `http://localhost:${port}/api` };
};

const filters = process.argv.slice(2);
const scripts = fs.readdirSync(__dirname)
    .filter((name) => /^verify-.*\.js$/.test(name))
    .filter((name) => filters.length === 0 || filters.some((filter) => name.includes(filter)))
    .sort((a, b) => (a === LAST) - (b === LAST) || a.localeCompare(b));

let exitCode = 2;
try {
    if (scripts.length === 0) throw new SetupError(`No verify scripts match: ${filters.join(', ')}`);

    const { mongoUri, dbName, redisUrl, port, apiUrl } = settings();
    const redisLabel = (() => { const url = new URL(redisUrl); return `${url.host}${url.pathname}`; })();
    const env = {
        ...process.env,
        MONGODB_URI: mongoUri,
        REDIS_URL: redisUrl,
        PORT: String(port),
        API_URL: apiUrl,
        NODE_ENV: 'test',
        VERIFY_DEV_PROXY: 'off'
    };

    // Preflight: MongoDB, Redis and the port. The connections are kept for
    // clean-up only once they're open, so a server that's down fails fast
    const connection = mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await connection.asPromise().catch(async () => {
        await connection.close().catch(() => {});
        throw new SetupError('MongoDB is not reachable. Start it first (docker start ems-mongo) and check MONGODB_URI.');
    });
    mongo = connection;
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 3000, reconnectStrategy: false } });
    client.on('error', () => {});
    await client.connect().catch(() => {
        throw new SetupError(`Redis is not reachable at ${redisLabel}. Start it first (docker start ems-redis).`);
    });
    redis = client;
    if (!(await isPortFree(port))) {
        throw new SetupError(`Port ${port} is already in use. A test API from an earlier run may still be running: stop it, or set TEST_PORT to another port.`);
    }

    // A clean, seeded test database, whatever an earlier run left behind
    await mongo.dropDatabase();
    await redis.flushDb();
    const seed = spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], { cwd: SERVER_DIR, env, encoding: 'utf8', timeout: 2 * 60 * 1000 });
    if (seed.status !== 0) {
        throw new SetupError(`Seeding the test database failed:\n${indent(`${seed.stdout || ''}${seed.stderr || ''}`)}`);
    }

    api = startApi({ cwd: SERVER_DIR, env });
    if (!(await waitForHealth(apiUrl, { timeoutMs: 30 * 1000, hasExited: api.hasExited }))) {
        throw new SetupError(`The test API didn't start on port ${port}. Its log:\n${indent(api.logTail())}`);
    }
    console.log(`Test environment: database ${dbName}, Redis ${redisLabel}, API ${apiUrl}`);

    const clearRateLimits = async () => {
        for await (const keys of redis.scanIterator({ MATCH: 'rl:*', COUNT: 100 })) {
            const batch = Array.isArray(keys) ? keys : [keys];
            if (batch.length > 0) await redis.del(batch);
        }
    };

    const results = [];
    for (const name of scripts) {
        await clearRateLimits();
        process.stdout.write(`${name.padEnd(42)}`);
        const run = spawnSync(process.execPath, [path.join(__dirname, name)], {
            cwd: SERVER_DIR,
            env,
            encoding: 'utf8',
            timeout: 5 * 60 * 1000
        });
        const output = `${run.stdout || ''}${run.stderr || ''}`;
        const passed = (output.match(/^PASS /gm) || []).length;
        const failed = (output.match(/^FAIL /gm) || []).length;
        const ok = run.status === 0;
        results.push({ name, ok, passed });
        console.log(ok ? `ok      ${passed} checks` : `FAILED  ${failed} failing check(s), exit ${run.status ?? run.signal}`);
        if (!ok) {
            console.log(indent(output));
            console.log('    --- test API log (last lines) ---');
            console.log(indent(api.logTail(30)));
        }
    }

    const failedScripts = results.filter((result) => !result.ok);
    const totalChecks = results.reduce((sum, result) => sum + result.passed, 0);
    const scriptCount = `${results.length} script${results.length === 1 ? '' : 's'}`;
    console.log('---');
    console.log(failedScripts.length === 0
        ? `${scriptCount} passed (${totalChecks} checks)`
        : `${failedScripts.length} of ${scriptCount} failed: ${failedScripts.map((result) => result.name).join(', ')}`);
    exitCode = failedScripts.length === 0 ? 0 : 1;
} catch (error) {
    console.error(error instanceof SetupError ? error.message : error);
    exitCode = 2;
} finally {
    await cleanUp();
}
process.exit(exitCode);
```

- [ ] **Step 4: Run the full suite with the dev server stopped**

Run: `cd /d/Projects/Employee-Management-System/server && npm test; echo "exit $?"`
Expected: a `Test environment: database employee_management_test, Redis localhost:6379/15, API http://localhost:5055/api` line, every script `ok` (23 scripts: the 22 existing ones plus `verify-test-env.js`), `verify-security-fixes.js ok 6 checks` (check 5 skipped), summary `23 scripts passed (...)`, `exit 0`.

- [ ] **Step 5: Confirm dev data is untouched and nothing is left behind**

Run:

```bash
docker exec ems-mongo mongosh employee_management --quiet --eval 'printjson(Object.fromEntries(db.getCollectionNames().sort().map(c => [c, db[c].countDocuments()])))'
docker exec ems-mongo mongosh --quiet --eval 'print(db.adminCommand({listDatabases: 1}).databases.map(d => d.name).filter(n => n.includes("_test")).join(",") || "no test databases")'
docker exec ems-redis redis-cli -n 15 dbsize
```

Expected: the first object equals the Step 1 baseline exactly; `no test databases`; `0`.

- [ ] **Step 6: Run it while the dev servers are running**

Start the dev API and the Vite dev server (preview servers `server` and `client`), then:

Run: `cd /d/Projects/Employee-Management-System/server && npm test; echo "exit $?"`
Expected: same result as Step 4 (`exit 0`), including `verify-security-fixes.js ok 6 checks`: check 5 is skipped even though Vite is up (7 checks would mean it went through Vite's proxy to the dev API). Afterwards `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/api/health` prints `200`, and the Step 5 counts still match the baseline.

- [ ] **Step 7: Setup failures exit 2 with a useful message**

Run each and check the message and `exit 2`:

```bash
cd /d/Projects/Employee-Management-System/server
TEST_MONGODB_URI='mongodb://localhost:27017/employee_management?replicaSet=rs0' npm test; echo "exit $?"
# Expected: Refusing to use database "employee_management": the test database name must end in _test ...

TEST_MONGODB_URI='mongodb://localhost:27999/employee_management_test?serverSelectionTimeoutMS=2000' npm test; echo "exit $?"
# Expected: MongoDB is not reachable ...

TEST_REDIS_URL='redis://localhost:6399/15' npm test; echo "exit $?"
# Expected: Redis is not reachable at localhost:6399/15 ...

node -e "require('net').createServer().listen(5055, () => console.log('holding 5055'))" &
HOLDER=$!; sleep 1; npm test; echo "exit $?"; kill $HOLDER
# Expected: Port 5055 is already in use. A test API from an earlier run may still be running ...

JWT_SECRET= npm test; echo "exit $?"
# Expected within ~30 s: The test API didn't start on port 5055. Its log: ... Missing required environment variables: JWT_SECRET ...
```

After the last one, re-run the second command of Step 5: `no test databases` (the failed run still cleaned up).

- [ ] **Step 8: A failing script exits 1, shows its output and the API log, and still cleans up**

Create a temporary failing script `server/scripts/verify-zz-temp-fail.js`:

```js
// TEMPORARY: proves npm test reports a failing script. Delete after use.
const res = await fetch(`${process.env.API_URL}/health`);
console.log(`FAIL  1 deliberate failure  (health=${res.status})`);
process.exit(1);
```

Run: `cd /d/Projects/Employee-Management-System/server && npm test -- zz-temp-fail test-env; echo "exit $?"`
Expected: `verify-test-env.js ok`, `verify-zz-temp-fail.js FAILED 1 failing check(s), exit 1`, followed by the indented `FAIL  1 deliberate failure  (health=200)` line and `--- test API log (last lines) ---` with the API's startup lines; summary `1 of 2 scripts failed: verify-zz-temp-fail.js`; `exit 1`. Then the Step 5 checks show no test database.

Delete it: `rm /d/Projects/Employee-Management-System/server/scripts/verify-zz-temp-fail.js`

- [ ] **Step 9: Ctrl+C cleans up**

In an interactive terminal: `cd /d/Projects/Employee-Management-System/server && npm test`, and press Ctrl+C once a few scripts have printed `ok`.
Expected: `SIGINT received: stopping the test API and removing test data`, then the prompt returns. Afterwards `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5055/api/health` prints `000` (nothing listening) and the Step 5 checks show no test database.
(If no interactive terminal is available to the executor, say so in the report instead of skipping silently.)

- [ ] **Step 10: Commit**

```bash
cd /d/Projects/Employee-Management-System && git add server/scripts/run-verify.js server/scripts/verify-security-fixes.js && git commit -m "test: run npm test against its own seeded database, Redis db and API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: GitHub Actions workflow and README

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (title area; "Verification Scripts" section)

**Interfaces:**
- Consumes: Task 3 `npm test` (exit codes 0/1/2, reads `server/.env`).
- Produces: workflow `CI` with jobs `Server tests` and `Client build`; badge URL `https://github.com/Sakeerin/EMS-Pro/actions/workflows/ci.yml/badge.svg`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# A newer push to the same branch or pull request replaces a run still going
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  server-tests:
    name: Server tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: server
    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4

      # Service containers can't take --replSet, and the app's transactions
      # need a replica set, so MongoDB is started by hand (as in the README)
      - name: Start MongoDB as a single-node replica set
        working-directory: .
        run: |
          docker run -d --name ems-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
          for i in $(seq 1 30); do
            docker exec ems-mongo mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1 && break
            sleep 1
          done
          docker exec ems-mongo mongosh --quiet --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]})'
          for i in $(seq 1 30); do
            state=$(docker exec ems-mongo mongosh --quiet --eval 'rs.status().members[0].stateStr' 2>/dev/null || true)
            if [ "$state" = "PRIMARY" ]; then exit 0; fi
            sleep 1
          done
          echo "MongoDB replica set did not become PRIMARY"
          exit 1

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: server/package-lock.json

      - run: npm ci

      # A fresh secret per run; nothing here needs to be kept
      - name: Write .env
        run: |
          {
            echo "MONGODB_URI=mongodb://localhost:27017/employee_management?replicaSet=rs0"
            echo "REDIS_URL=redis://localhost:6379"
            echo "JWT_SECRET=$(openssl rand -hex 64)"
          } > .env

      - name: Run the verification scripts
        run: npm test

  client-build:
    name: Client build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        working-directory: client
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: client/package-lock.json
      - run: npm ci
      - run: npm run build
```

- [ ] **Step 2: Check the YAML parses**

Run: `cd /d/Projects/Employee-Management-System && python -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs']), d[True] if True in d else d.get('on'))"`
Expected: `['client-build', 'server-tests']` and the triggers dict (PyYAML reads the `on` key as `True`). If PyYAML isn't installed (`ModuleNotFoundError`), note it and rely on GitHub's own workflow validation at push time.

- [ ] **Step 3: Update the README**

Insert after the first line `# Employee Management System - MERN Stack`:

```markdown

[![CI](https://github.com/Sakeerin/EMS-Pro/actions/workflows/ci.yml/badge.svg)](https://github.com/Sakeerin/EMS-Pro/actions/workflows/ci.yml)
```

In "## 🧪 Verification Scripts", replace

```markdown
These scripts exercise the real API end to end. With the API running on port 5000 (`npm run dev`), MongoDB and Redis up, and the demo data loaded, run them all from `server/`:
```

with

```markdown
These scripts exercise the real API end to end. With MongoDB and Redis running, run them all from `server/`; the dev server doesn't need to be running:
```

and replace

```markdown
`npm test` resets the login rate limits in Redis before each script (and at the end), runs `verify-login-rate-limit.js` last, prints the full output of any script that fails, and exits non-zero if one does. Each script can also be run on its own:
```

with

```markdown
`npm test` never touches your dev data. It creates a test database (`employee_management_test`, next to the one in `MONGODB_URI`) and uses Redis database 15, seeds the demo data, starts its own API on port 5055, runs the scripts, then stops the API and deletes the test data. Override the settings with `TEST_MONGODB_URI` (its database name must end in `_test`), `TEST_REDIS_URL` and `TEST_PORT`. It resets the login rate limits before each script, runs `verify-login-rate-limit.js` last, prints the output of any script that fails plus the end of the test API's log, and exits 0 when all pass, 1 when one fails, 2 when the test environment can't be set up.

**CI:** GitHub Actions runs the same `npm test` (against MongoDB and Redis containers) and builds the client on every push and pull request to `main`; see `.github/workflows/ci.yml`.

Each script can also be run on its own against the dev server (`npm run dev`) and dev database:
```

Add one row to the scripts table, after the `verify-leave-test-dates.js` row:

```markdown
| `node scripts/verify-test-env.js` | How `npm test` derives its test database, Redis database and port from the dev settings, and that only `*_test` databases are accepted (no API needed) |
```

- [ ] **Step 4: Final full run**

Run: `cd /d/Projects/Employee-Management-System/server && npm test; echo "exit $?"` and `cd ../client && npm run build`
Expected: all scripts `ok`, `exit 0`; client `✓ built`.

- [ ] **Step 5: Commit**

```bash
cd /d/Projects/Employee-Management-System && git add .github/workflows/ci.yml README.md && git commit -m "ci: run the verification scripts and a client build on every push and PR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand over to the user (no push yet)**

Report what was done, then ask the user whether to merge `ci/self-contained-tests` into `main` and push. Only after they say so:

```bash
cd /d/Projects/Employee-Management-System && git switch main && git merge --ff-only ci/self-contained-tests && git push origin main
gh run list --workflow ci.yml --limit 1
gh run watch "$(gh run list --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Expected: both jobs `✓`. If a job fails, read its log with `gh run view --log-failed` and fix on a new branch.

- [ ] **Step 7: Prove a red build (only with the user's go-ahead)**

Ask first: this pushes a temporary branch and opens a pull request on GitHub. If the user agrees:

```bash
cd /d/Projects/Employee-Management-System && git switch -c ci/prove-red main
printf "// TEMPORARY: proves CI goes red. Delete with this branch.\nconsole.log('FAIL  1 deliberate CI failure  (expected)');\nprocess.exit(1);\n" > server/scripts/verify-zz-ci-red.js
git add server/scripts/verify-zz-ci-red.js && git commit -m "test: deliberately failing script to prove CI goes red (do not merge)"
git push -u origin ci/prove-red
gh pr create --base main --head ci/prove-red --title "Do not merge: prove CI goes red" --body "Temporary PR to check that a failing verification script turns CI red. Will be closed and the branch deleted."
gh run watch "$(gh run list --branch ci/prove-red --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: `Server tests` fails and its log names `verify-zz-ci-red.js`; `Client build` passes. Then clean up:

```bash
gh pr close ci/prove-red --delete-branch
git switch main && git branch -D ci/prove-red
```
