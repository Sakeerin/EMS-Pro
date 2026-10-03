// Checks the date helper the leave verification scripts use (scripts/lib/
// leaveTestDates.js) for every day of three years: future dates come after
// "today", stay within one calendar year and no later than next year; past
// dates have all begun, sit in one calendar year and no earlier than last
// year. These are the API's leave rules, so the scripts pass year-round.
//
// Usage (from server/): node scripts/verify-leave-test-dates.js
// Needs no API or database.

import { addDays, futureAnchor, pastAnchor, FUTURE_WEEKS } from './lib/leaveTestDates.js';

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

const isMonday = (isoDate) => new Date(`${isoDate}T00:00:00Z`).getUTCDay() === 1;
const year = (isoDate) => Number(isoDate.slice(0, 4));
const startYear = new Date().getFullYear() - 1;

const futureProblems = [];
const pastProblems = [];
for (let day = `${startYear}-01-01`; year(day) < startYear + 3; day = addDays(day, 1)) {
    const future = futureAnchor(day);
    const lastFuture = addDays(future, FUTURE_WEEKS * 7 - 1);
    if (!isMonday(future) || future <= day || year(lastFuture) !== year(future) || year(future) > year(day) + 1) {
        futureProblems.push(`${day} -> ${future}..${lastFuture}`);
    }
    const past = pastAnchor(day);
    const pastFriday = addDays(past, 4);
    if (!isMonday(past) || pastFriday >= day || year(pastFriday) !== year(past) || year(past) < year(day) - 1) {
        pastProblems.push(`${day} -> ${past}..${pastFriday}`);
    }
}

check('1 future weeks: after today, one calendar year, by next year', futureProblems.length === 0,
    futureProblems.length ? futureProblems.slice(0, 3).join('; ') : `every day ${startYear}-${startYear + 2}`);
check('2 past week: already begun, one calendar year, from last year', pastProblems.length === 0,
    pastProblems.length ? pastProblems.slice(0, 3).join('; ') : `every day ${startYear}-${startYear + 2}`);

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
