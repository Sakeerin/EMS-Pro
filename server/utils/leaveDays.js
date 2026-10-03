// Leave dates arrive as YYYY-MM-DD and are stored as UTC midnight of that day,
// so all calendar arithmetic here is done in UTC.

// Weekdays (Mon-Fri) from start to end, both included
export const countBusinessDays = (start, end) => {
    let days = 0;
    for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
        const dayOfWeek = day.getUTCDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) days++;
    }
    return days;
};

// Query condition matching dates in the given calendar year
export const inYear = (year) => ({
    $gte: new Date(Date.UTC(year, 0, 1)),
    $lt: new Date(Date.UTC(year + 1, 0, 1))
});
