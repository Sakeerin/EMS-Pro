// Runs every scripts/verify-*.js against the running API, resetting the login
// rate-limit keys in Redis before each one, and prints a summary.
//
// Usage (from server/): npm test             run all scripts
//                       npm test -- leave    only scripts whose name contains "leave"
// Needs the API running (npm run dev), MongoDB, Redis and the seed data.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from 'redis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}/api`;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// Runs last: it leaves this machine's IP at the login limit
const LAST = 'verify-login-rate-limit.js';

const stop = (message) => {
    console.error(message);
    process.exit(2);
};

const filters = process.argv.slice(2);
const scripts = fs.readdirSync(__dirname)
    .filter((name) => /^verify-.*\.js$/.test(name))
    .filter((name) => filters.length === 0 || filters.some((filter) => name.includes(filter)))
    .sort((a, b) => (a === LAST) - (b === LAST) || a.localeCompare(b));
if (scripts.length === 0) {
    stop(`No verify scripts match: ${filters.join(', ')}`);
}

const health = await fetch(`${API}/health`).then((res) => res.status).catch(() => null);
if (health !== 200) {
    stop(`API not reachable at ${API}. Start it with "npm run dev" (with MongoDB and Redis running) first.`);
}

const redis = createClient({ url: REDIS_URL, socket: { connectTimeout: 3000, reconnectStrategy: false } });
redis.on('error', () => {});
await redis.connect().catch(() => {
    stop(`Redis not reachable at ${REDIS_URL}. Start it first: the runner resets login limits there between scripts.`);
});

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
        cwd: path.join(__dirname, '..'),
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
        console.log(output.trimEnd().split('\n').map((line) => `    ${line}`).join('\n'));
    }
}
await clearRateLimits();
await redis.quit();

const failedScripts = results.filter((result) => !result.ok);
const totalChecks = results.reduce((sum, result) => sum + result.passed, 0);
const scriptCount = `${results.length} script${results.length === 1 ? '' : 's'}`;
console.log('---');
console.log(failedScripts.length === 0
    ? `${scriptCount} passed (${totalChecks} checks)`
    : `${failedScripts.length} of ${scriptCount} failed: ${failedScripts.map((result) => result.name).join(', ')}`);
process.exit(failedScripts.length === 0 ? 0 : 1);
