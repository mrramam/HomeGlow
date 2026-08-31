// Streak math for routines. The streak counts CONSECUTIVE SCHEDULED
// OCCURRENCES, not consecutive calendar days — so a Monday-to-Friday routine
// bridges Friday to Monday without breaking. Kept as a pure module so it can
// be unit-tested without spinning up the server.

const { CronExpressionParser } = require('cron-parser');

function parseDateOnly(dateStr) {
    if (typeof dateStr !== 'string') return null;
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const [y, m, d] = parts;
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function formatDateOnly(dateObj) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

// The scheduled date STRICTLY BEFORE `dateStr`, per the crontab. Returns
// null if the crontab is invalid or has no earlier occurrence.
function previousScheduledDate(crontab, dateStr) {
    const startOfDay = parseDateOnly(dateStr);
    if (!startOfDay) return null;
    try {
        const parser = CronExpressionParser.parse(crontab, {
            currentDate: new Date(startOfDay.getTime() - 1),
        });
        return formatDateOnly(parser.prev().toDate());
    } catch {
        return null;
    }
}

// New streak given a completion on `completionDate` and the persisted state
// (`lastCompletionDate` / `lastStreak`). If the previous SCHEDULED date is
// the same as the last completion, the streak grows; otherwise it resets to
// 1. History is not scanned — so a schedule change mid-streak keeps the
// existing count and lets the next completion continue from there.
function computeStreakForCompletion({ crontab, lastCompletionDate, lastStreak, completionDate }) {
    const prev = previousScheduledDate(crontab, completionDate);
    if (prev && lastCompletionDate === prev) {
        return (Number.isInteger(lastStreak) && lastStreak > 0 ? lastStreak : 0) + 1;
    }
    return 1;
}

// Enumerate scheduled dates in [startDateStr, endDateStr] as 'YYYY-MM-DD'
// strings. Cap iterations to avoid runaway loops on pathological crontabs.
function enumerateScheduledDates(crontab, startDateStr, endDateStr) {
    const start = parseDateOnly(startDateStr);
    const end = parseDateOnly(endDateStr);
    if (!start || !end) return [];
    const endInstant = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    const out = [];
    try {
        const parser = CronExpressionParser.parse(crontab, {
            currentDate: new Date(start.getTime() - 1),
            endDate: endInstant,
        });
        for (let i = 0; i < 5000; i++) {
            let next;
            try {
                next = parser.next().toDate();
            } catch {
                break;
            }
            if (!next || next > endInstant) break;
            const key = formatDateOnly(next);
            if (out.length === 0 || out[out.length - 1] !== key) {
                out.push(key);
            }
        }
    } catch {
        // Invalid crontab: caller gets an empty list.
    }
    return out;
}

module.exports = {
    parseDateOnly,
    formatDateOnly,
    previousScheduledDate,
    computeStreakForCompletion,
    enumerateScheduledDates,
};
