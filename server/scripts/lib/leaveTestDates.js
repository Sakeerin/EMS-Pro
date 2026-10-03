// Leave dates for the verification scripts, worked out from today so they
// keep passing as time goes by. The API accepts leave from last year to next
// year, one calendar year per request, and treats leave that has begun as
// taken. Dates are YYYY-MM-DD strings; weekday 0 is Monday ... 6 is Sunday.

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (isoDate) => new Date(`${isoDate}T00:00:00Z`);
export const addDays = (isoDate, days) => new Date(toDate(isoDate).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const isMonday = (isoDate) => toDate(isoDate).getUTCDay() === 1;
const yearOf = (isoDate) => isoDate.slice(0, 4);

// Today on this machine: the API's today too when both run here
export const today = () => new Date().toLocaleDateString('en-CA');

// How many weeks from the future anchor the scripts may use
export const FUTURE_WEEKS = 8;

// A Monday after `from` from which the next FUTURE_WEEKS weeks all fall in one
// calendar year: the next Monday if that fits, otherwise the first Monday of
// next year
export const futureAnchor = (from = today()) => {
    let monday = addDays(from, 1);
    while (!isMonday(monday)) monday = addDays(monday, 1);
    if (yearOf(addDays(monday, FUTURE_WEEKS * 7 - 1)) === yearOf(monday)) return monday;
    let firstOfNextYear = `${Number(yearOf(from)) + 1}-01-01`;
    while (!isMonday(firstOfNextYear)) firstOfNextYear = addDays(firstOfNextYear, 1);
    return firstOfNextYear;
};

// The Monday of the latest week before `from` whose Monday to Friday have all
// passed and fall in one calendar year
export const pastAnchor = (from = today()) => {
    let monday = addDays(from, -1);
    while (!isMonday(monday)) monday = addDays(monday, -1);
    while (addDays(monday, 4) >= from || yearOf(addDays(monday, 4)) !== yearOf(monday)) monday = addDays(monday, -7);
    return monday;
};

// A day in week `week` (0 to FUTURE_WEEKS - 1) after the future anchor
export const futureDay = (week, weekday, from = today()) => addDays(futureAnchor(from), week * 7 + weekday);

// A weekday in the past week from pastAnchor
export const pastDay = (weekday, from = today()) => addDays(pastAnchor(from), weekday);
