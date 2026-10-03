// Checks the helpers that derive npm test's isolated settings from the dev
// ones (scripts/lib/testEnv.js): the test database keeps the connection's
// hosts, credentials and options and only changes the database name, the
// test Redis keeps host and credentials and uses database 15, only databases
// named *_test count as test databases, malformed URLs are refused without
// repeating them, and a test Redis that would flush db 0 or the dev
// database is refused.
//
// Usage (from server/): node scripts/verify-test-env.js
// Needs no API or database.

import { databaseName, isSafeTestRedis, isTestDatabaseName, redisDatabase, testMongoUri, testRedisUrl } from './lib/testEnv.js';

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

// 6. A malformed Redis URL is refused without echoing it (or its password)
const thrown = [];
for (const fn of [() => testRedisUrl('redis//:hunter2@cache:6379'), () => redisDatabase('redis//:hunter2@cache:6379')]) {
    try { fn(); thrown.push('(no error)'); } catch (err) { thrown.push(`${err.message} ${err.input ?? ''}`); }
}
check('6 malformed Redis URL refused quietly', thrown.every((text) => text !== '(no error)' && !text.includes('hunter2')),
    thrown.map((text) => `'${text.trim()}'`).join(' / '));

// 7. Which logical database a Redis URL uses (0 when it names none)
table('7 Redis database number', (url) => redisDatabase(url), [
    ['redis://localhost:6379', 0],
    ['redis://localhost:6379/', 0],
    ['redis://localhost:6379/0', 0],
    ['redis://localhost:6379/15', 15],
    ['rediss://:pw@cache:6380/3', 3]
]);

// 8. npm test flushes its Redis database, so never db 0 or the dev server's database
table('8 safe test Redis', ([testUrl, devUrl]) => isSafeTestRedis(testUrl, devUrl), [
    [['redis://localhost:6379/15', 'redis://localhost:6379'], true],
    [['redis://localhost:6379', 'redis://localhost:6379'], false],
    [['redis://localhost:6379/0', 'redis://other:6379/2'], false],
    [['redis://localhost:6379/2', 'redis://localhost:6379/2'], false],
    [['redis://localhost:6379/2', 'redis://other-host:6379/2'], true],
    [['redis://localhost:6379/15', 'not a url'], true]
]);

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
