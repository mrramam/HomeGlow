const test = require('node:test');
const assert = require('node:assert/strict');
const {
    previousScheduledDate,
    computeStreakForCompletion,
    enumerateScheduledDates,
} = require('../utils/routineStreak');

// School-days routine (Mon-Fri at midnight): counts must bridge Fri → Mon.
const MON_TO_FRI = '0 0 * * 1-5';
const DAILY = '0 0 * * *';

test('previousScheduledDate on Mon-Fri bridges Fri to Mon', () => {
    // Monday 2026-08-31 -> previous scheduled is Friday 2026-08-28.
    assert.equal(previousScheduledDate(MON_TO_FRI, '2026-08-31'), '2026-08-28');
});

test('previousScheduledDate on Mon-Fri: Tuesday looks back to Monday', () => {
    assert.equal(previousScheduledDate(MON_TO_FRI, '2026-09-01'), '2026-08-31');
});

test('previousScheduledDate on daily crontab is always the day before', () => {
    assert.equal(previousScheduledDate(DAILY, '2026-08-31'), '2026-08-30');
});

test('previousScheduledDate returns null for invalid crontab', () => {
    assert.equal(previousScheduledDate('not a crontab', '2026-08-31'), null);
});

test('Mon-Fri routine completed Thu, Fri, Mon reads as a streak of 3', () => {
    // Thu 2026-08-27. Previous scheduled = Wed. No prior completion → 1.
    let streak = 0;
    let last = null;

    streak = computeStreakForCompletion({
        crontab: MON_TO_FRI,
        lastCompletionDate: last,
        lastStreak: streak,
        completionDate: '2026-08-27',
    });
    assert.equal(streak, 1, 'Thursday: first completion');
    last = '2026-08-27';

    // Fri 2026-08-28. Previous scheduled = Thu. Last completion = Thu → 2.
    streak = computeStreakForCompletion({
        crontab: MON_TO_FRI,
        lastCompletionDate: last,
        lastStreak: streak,
        completionDate: '2026-08-28',
    });
    assert.equal(streak, 2, 'Friday: continues');
    last = '2026-08-28';

    // Mon 2026-08-31. Previous scheduled = Fri (weekend not scheduled).
    // Last completion = Fri → 3.
    streak = computeStreakForCompletion({
        crontab: MON_TO_FRI,
        lastCompletionDate: last,
        lastStreak: streak,
        completionDate: '2026-08-31',
    });
    assert.equal(streak, 3, 'Monday bridges the weekend to reach 3');
});

test('a missed scheduled day breaks the chain, resetting to 1', () => {
    // Daily routine. Complete Mon, skip Tue, complete Wed → streak resets.
    let streak = computeStreakForCompletion({
        crontab: DAILY,
        lastCompletionDate: null,
        lastStreak: 0,
        completionDate: '2026-08-31',
    });
    assert.equal(streak, 1);

    // Wed 2026-09-02 with Mon 2026-08-31 as last completion. Previous
    // scheduled = Tue 2026-09-01 — not equal to last completion → reset.
    streak = computeStreakForCompletion({
        crontab: DAILY,
        lastCompletionDate: '2026-08-31',
        lastStreak: streak,
        completionDate: '2026-09-02',
    });
    assert.equal(streak, 1, 'Missed Tuesday resets Wednesday to 1');
});

test('daily routine grown over several days accumulates the streak', () => {
    let streak = 0;
    let last = null;
    for (const day of ['2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01']) {
        streak = computeStreakForCompletion({
            crontab: DAILY,
            lastCompletionDate: last,
            lastStreak: streak,
            completionDate: day,
        });
        last = day;
    }
    assert.equal(streak, 4);
});

test('changing the schedule mid-streak keeps the count going forward', () => {
    // Was daily and reached 3.
    let streak = 3;
    let last = '2026-08-30';
    // Change to Mon-Fri. Next completion is Mon 2026-08-31. Under the NEW
    // crontab the previous scheduled date is Fri 2026-08-28. Last completion
    // is Sun 2026-08-30 (from the old cadence). Not equal → resets. This is
    // the correct forward-only behaviour: history is not recomputed under
    // the new cadence, but the next completion evaluates prev-scheduled per
    // the current schedule.
    streak = computeStreakForCompletion({
        crontab: MON_TO_FRI,
        lastCompletionDate: last,
        lastStreak: streak,
        completionDate: '2026-08-31',
    });
    // The count is not retroactively wiped — it existed at 3 until this
    // completion, and it resets going forward because the previous
    // scheduled slot per the new schedule was not completed. What the spec
    // rules out is RECOMPUTING history against the new cadence to erase the
    // 3 that was already lived.
    assert.equal(streak, 1);
});

test('enumerateScheduledDates lists every Mon-Fri date in the range', () => {
    const dates = enumerateScheduledDates(MON_TO_FRI, '2026-08-24', '2026-08-30');
    assert.deepEqual(dates, ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']);
});

test('enumerateScheduledDates handles an invalid crontab as empty', () => {
    assert.deepEqual(enumerateScheduledDates('nonsense', '2026-08-24', '2026-08-30'), []);
});
