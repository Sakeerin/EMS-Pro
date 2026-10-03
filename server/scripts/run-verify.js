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
// environment couldn't be set up, 130/143 when interrupted (Ctrl+C / SIGTERM).

import { spawn } from 'child_process';
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
let currentChild = null;
let interrupted = null;
// Set once this run has started replacing the test data. A run refused
// earlier (say, because another npm test holds the port) must leave that
// run's data alone
let ownsTestData = false;
let cleanupPromise = null;

// Leaves nothing behind: no API process, no test data. Every caller waits for
// the same clean-up, so exiting can't cut it short
const cleanUp = () => {
    cleanupPromise ??= (async () => {
        currentChild?.kill();
        if (api) await api.stop();
        if (mongo) {
            if (ownsTestData) await mongo.dropDatabase().catch(() => {});
            await mongo.close().catch(() => {});
        }
        if (redis) {
            if (ownsTestData) await redis.flushDb().catch(() => {});
            await redis.quit().catch(() => {});
        }
    })();
    return cleanupPromise;
};

// Ctrl+C or SIGTERM: stop the running script and the API at once; the main
// flow then stops at its next step, cleans up and exits 130/143
const INTERRUPTED = new Error('interrupted');
const stopIfInterrupted = () => {
    if (interrupted) throw INTERRUPTED;
};
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (interrupted) return;
        interrupted = signal;
        console.error(`\n${signal} received: stopping the test API and removing test data`);
        currentChild?.kill();
        api?.stop();
        // Last resort if the main flow doesn't wind down
        setTimeout(() => cleanUp().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143)), 20 * 1000).unref();
    });
}

// Runs a node script to the end without blocking the event loop, so signals
// are handled straight away and the API's output keeps being read
const runNode = (file, env, timeoutMs) => new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    currentChild = child;
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (status, signal) => {
        clearTimeout(timer);
        if (currentChild === child) currentChild = null;
        resolve({ status, signal, output });
    });
});

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
        throw new SetupError(`Port ${port} is already in use: another npm test may be running, or a test API left over from an interrupted run. Wait for it to finish (or stop the leftover API). A run in parallel needs its own TEST_PORT, TEST_MONGODB_URI and TEST_REDIS_URL.`);
    }
    stopIfInterrupted();

    // A clean, seeded test database, whatever an earlier run left behind
    ownsTestData = true;
    await mongo.dropDatabase();
    await redis.flushDb();
    const seed = await runNode(path.join(__dirname, 'seed.js'), env, 2 * 60 * 1000);
    stopIfInterrupted();
    if (seed.status !== 0) {
        throw new SetupError(`Seeding the test database failed:\n${indent(seed.output)}`);
    }

    api = startApi({ cwd: SERVER_DIR, env });
    const healthy = await waitForHealth(apiUrl, { timeoutMs: 30 * 1000, hasExited: api.hasExited });
    stopIfInterrupted();
    if (!healthy) {
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
        stopIfInterrupted();
        await clearRateLimits();
        process.stdout.write(`${name.padEnd(42)}`);
        const run = await runNode(path.join(__dirname, name), env, 5 * 60 * 1000);
        if (interrupted) {
            console.log('interrupted');
            stopIfInterrupted();
        }
        const passed = (run.output.match(/^PASS /gm) || []).length;
        const failed = (run.output.match(/^FAIL /gm) || []).length;
        const ok = run.status === 0;
        results.push({ name, ok, passed });
        console.log(ok ? `ok      ${passed} checks` : `FAILED  ${failed} failing check(s), exit ${run.status ?? run.signal}`);
        if (!ok) {
            console.log(indent(run.output));
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
    // After an interrupt, errors from the stopped API or closing connections are expected
    if (!interrupted) {
        console.error(error instanceof SetupError ? error.message : error);
        exitCode = 2;
    }
} finally {
    await cleanUp();
}
process.exit(interrupted ? (interrupted === 'SIGINT' ? 130 : 143) : exitCode);
