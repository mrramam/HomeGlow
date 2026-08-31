const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `routines-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 6600 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;
let serverLogs = '';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/api/test`);
            if (response.ok) return;
        } catch {
            // still starting
        }
        await delay(250);
    }
    throw new Error(`Server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
}

async function api(pathname, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status: response.status, body };
}

// Server runs TZ=UTC; compute the "today" it will see.
function todayUtc() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    serverProcess = spawn('node', ['index.js'], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: String(port),
            DB_PATH: testDbPath,
            TZ: 'UTC',
            HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
            HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
            ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    await waitForServerReady();
});

test.after(async () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            serverProcess.once('close', () => resolve());
            setTimeout(resolve, 5000);
        });
    }
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

async function createUser(name) {
    const res = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: name, email: `${name}@example.com` }),
    });
    assert.equal(res.status, 200);
    return res.body.id;
}

async function createRoutineWithSteps(userId, name, titles, opts = {}) {
    const create = await api('/api/routines', {
        method: 'POST',
        body: JSON.stringify({
            name,
            user_id: userId,
            crontab: opts.crontab || '0 0 * * *',
            start_time: opts.start_time,
            end_time: opts.end_time,
            streak_bonus_every: opts.streak_bonus_every || 0,
            streak_bonus_clams: opts.streak_bonus_clams || 0,
        }),
    });
    assert.equal(create.status, 200, `create routine: ${JSON.stringify(create.body)}`);
    const routineId = create.body.id;
    const stepIds = [];
    for (const title of titles) {
        const res = await api(`/api/routines/${routineId}/steps`, {
            method: 'POST',
            body: JSON.stringify({ title }),
        });
        assert.equal(res.status, 200, `add step: ${JSON.stringify(res.body)}`);
        stepIds.push(res.body.step_id);
    }
    return { routineId, stepIds };
}

async function historyFor(userId) {
    const res = await api(`/api/chore-history/user/${userId}`);
    return res.body;
}

test('CRUD and progress: routine creation, step add, tick, completion recorded', async () => {
    const userId = await createUser('routine-morning');
    const { routineId, stepIds } = await createRoutineWithSteps(userId, 'Morning', [
        'Make bed', 'Brush teeth', 'Get dressed',
    ]);

    const detail = await api(`/api/routines/${routineId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.steps.length, 3);
    assert.equal(detail.body.steps[0].title, 'Make bed');
    assert.equal(detail.body.steps[0].position, 0);

    const today = todayUtc();
    for (const stepId of stepIds.slice(0, -1)) {
        const res = await api(`/api/routines/${routineId}/steps/${stepId}/tick`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.recorded_completion, false, 'not complete until last step ticked');
    }

    const last = await api(`/api/routines/${routineId}/steps/${stepIds[stepIds.length - 1]}/tick`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
    assert.equal(last.status, 200);
    assert.equal(last.body.complete, true);
    assert.equal(last.body.recorded_completion, true);
    assert.equal(last.body.current_streak, 1);

    const history = await historyFor(userId);
    const routineRows = history.filter((r) => r.kind === 'routine' && r.date === today);
    assert.equal(routineRows.length, 1, 'exactly one ledger row for the completion');
    assert.equal(routineRows[0].clam_value, 0, 'routine completions do not award clams directly');

    const progress = await api(`/api/routines/${routineId}/progress?date=${today}`);
    assert.equal(progress.body.complete, true);
    assert.equal(progress.body.recorded_completion, true);
});

test('completion is idempotent: double-tapping the same step does not duplicate the ledger row', async () => {
    const userId = await createUser('routine-idempotent');
    const { routineId, stepIds } = await createRoutineWithSteps(userId, 'Idem', ['Only step']);

    const today = todayUtc();
    const first = await api(`/api/routines/${routineId}/steps/${stepIds[0]}/tick`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.recorded_completion, true);
    assert.equal(first.body.current_streak, 1);

    // Tap it again. Wall displays double-fire; the UNIQUE constraint plus
    // INSERT OR IGNORE means this is a no-op both in progress and in the
    // ledger.
    const second = await api(`/api/routines/${routineId}/steps/${stepIds[0]}/tick`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.recorded_completion, true);
    // The streak reported here is the one persisted (still 1) — not 2.
    assert.equal(second.body.current_streak, 1, 'streak must NOT double-advance');

    const history = await historyFor(userId);
    assert.equal(
        history.filter((r) => r.kind === 'routine' && r.date === today).length,
        1,
        'ledger has exactly one routine row',
    );
});

test('unticking a step AFTER completion clears progress but leaves the ledger intact', async () => {
    const userId = await createUser('routine-untick');
    // Bonus every completion — first tick pays 5 clams too, so we can prove
    // the streak bonus is not clawed back either.
    const { routineId, stepIds } = await createRoutineWithSteps(userId, 'Reward', ['Only step'], {
        streak_bonus_every: 1,
        streak_bonus_clams: 5,
    });

    const today = todayUtc();
    const tick = await api(`/api/routines/${routineId}/steps/${stepIds[0]}/tick`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
    assert.equal(tick.status, 200);
    assert.equal(tick.body.streak_bonus_awarded, true);

    const beforeHistory = await historyFor(userId);
    const beforeRoutine = beforeHistory.filter((r) => r.kind === 'routine' && r.date === today);
    const beforeStreak = beforeHistory.filter((r) => r.kind === 'streak' && r.date === today);
    assert.equal(beforeRoutine.length, 1);
    assert.equal(beforeStreak.length, 1);
    assert.equal(beforeStreak[0].clam_value, 5);

    // Untick.
    const untick = await api(`/api/routines/${routineId}/steps/${stepIds[0]}/tick`, {
        method: 'DELETE',
    });
    assert.equal(untick.status, 200);
    assert.equal(untick.body.done_steps, 0, 'progress row is gone');
    assert.equal(untick.body.complete, false);

    // Ledger untouched: neither the completion row nor the streak bonus was clawed back.
    const afterHistory = await historyFor(userId);
    assert.equal(
        afterHistory.filter((r) => r.kind === 'routine' && r.date === today).length,
        1,
        'ledger completion row survives untick',
    );
    assert.equal(
        afterHistory.filter((r) => r.kind === 'streak' && r.date === today).length,
        1,
        'ledger streak-bonus row survives untick',
    );

    // Balance still reflects the streak bonus.
    const summary = await api(`/api/chore-history/summary/${userId}`);
    assert.equal(summary.body.clam_total, 5);
});

test('only today is completable: yesterday is rejected 400', async () => {
    const userId = await createUser('routine-today');
    const { routineId, stepIds } = await createRoutineWithSteps(userId, 'Today only', ['Only step']);
    const res = await api(`/api/routines/${routineId}/steps/${stepIds[0]}/tick`, {
        method: 'POST',
        body: JSON.stringify({ date: '2020-01-01' }),
    });
    assert.equal(res.status, 400);
});

test('routine occurrences endpoint synthesises calendar-shape entries', async () => {
    const userId = await createUser('routine-cal');
    await createRoutineWithSteps(userId, 'Morning cal', ['Step'], {
        crontab: '0 7 * * 1-5',
        start_time: '07:00',
        end_time: '07:30',
    });
    // A wide window in 2026 hits several weekdays.
    const res = await api('/api/routine-occurrences?start=2026-08-24&end=2026-08-30');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const mine = res.body.filter((e) => e.summary === 'Morning cal');
    assert.equal(mine.length, 5, 'five weekdays in that Mon-Sun range');
    for (const occ of mine) {
        assert.equal(occ.source, 'routine');
        assert.equal(typeof occ.routine_id, 'number');
        assert.equal(occ.user_id, userId);
    }
});

test('autocomplete endpoint merges step titles and chore titles', async () => {
    await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'ChoreForAutocomplete', icon: '🧺' }),
    });
    await api('/api/steps', {
        method: 'POST',
        body: JSON.stringify({ title: 'StepForAutocomplete', icon: '🪥' }),
    });
    const res = await api('/api/task-titles');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const chore = res.body.find((r) => r.title === 'ChoreForAutocomplete');
    const step = res.body.find((r) => r.title === 'StepForAutocomplete');
    assert.ok(chore, 'chore title present');
    assert.ok(step, 'step title present');
    assert.equal(chore.source, 'chore');
    assert.equal(chore.icon, '🧺');
    assert.equal(step.source, 'step');
    assert.equal(step.icon, '🪥');
});

test('routine feature does not alter chore-history rows for regular chores', async () => {
    // Regression guard against accidentally coupling routines into the chore
    // completion path: a plain chore completion must still write a single
    // kind='completion' row and NOT gain a routine_id.
    const userId = await createUser('routine-noninterference');
    const chore = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Sweep porch', clam_value: 1 }),
    });
    const schedule = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: chore.body.id,
            user_id: userId,
            crontab: '0 0 * * *',
            duration: 'day-of',
        }),
    });
    const today = todayUtc();
    const complete = await api('/api/chores/complete', {
        method: 'POST',
        body: JSON.stringify({ chore_schedule_id: schedule.body.id, user_id: userId, date: today }),
    });
    assert.equal(complete.status, 200);
    const history = await historyFor(userId);
    const completions = history.filter((r) => r.kind === 'completion' && r.date === today);
    assert.equal(completions.length, 1);
});
