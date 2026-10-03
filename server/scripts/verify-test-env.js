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
