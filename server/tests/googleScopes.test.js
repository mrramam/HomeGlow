const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { SCOPE_SETS, resolveScopes } = require('../services/googleConnection');

// --- Unit tests ---

test('SCOPE_SETS.calendar contains no photoslibrary or photospicker scopes', () => {
    const restricted = SCOPE_SETS.calendar.filter(
        (s) => s.includes('photoslibrary') || s.includes('photospicker')
    );
    assert.deepEqual(restricted, [], 'Calendar scope set must not include any Photos scopes');
});

test('SCOPE_SETS.photos contains both restricted Photos scopes', () => {
    assert.ok(
        SCOPE_SETS.photos.includes('https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata'),
        'Missing photoslibrary scope'
    );
    assert.ok(
        SCOPE_SETS.photos.includes('https://www.googleapis.com/auth/photospicker.mediaitems.readonly'),
        'Missing photospicker scope'
    );
});

test('resolveScopes with absent, null, empty, or whitespace-only service returns all 6 scopes', () => {
    const full = resolveScopes(undefined);
    assert.equal(full.length, 6, 'Expected 6 scopes for the full default');
    assert.ok(full.includes('https://www.googleapis.com/auth/calendar'), 'Missing calendar scope');
    assert.ok(full.includes('https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata'), 'Missing photoslibrary scope');
    assert.ok(full.includes('https://www.googleapis.com/auth/photospicker.mediaitems.readonly'), 'Missing photospicker scope');
    for (const base of ['openid', 'email', 'profile']) {
        assert.equal(full.filter((s) => s === base).length, 1, `"${base}" must appear exactly once`);
    }

    assert.deepEqual(resolveScopes(null),  full, 'null should resolve identically');
    assert.deepEqual(resolveScopes(''),    full, 'empty string should resolve identically');
    assert.deepEqual(resolveScopes('   '), full, 'whitespace-only should resolve identically');
});

test('resolveScopes("calendar,bogus") returns exactly the 4 calendar scopes, no photos, no duplicates', () => {
    const result = resolveScopes('calendar,bogus');
    assert.equal(result.length, 4, 'Expected exactly 4 scopes');
    assert.ok(result.includes('https://www.googleapis.com/auth/calendar'), 'Missing calendar scope');
    assert.ok(!result.includes('https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata'), 'Must not include photoslibrary scope');
    assert.ok(!result.includes('https://www.googleapis.com/auth/photospicker.mediaitems.readonly'), 'Must not include photospicker scope');
    for (const base of ['openid', 'email', 'profile']) {
        assert.equal(result.filter((s) => s === base).length, 1, `"${base}" must appear exactly once`);
    }
});

test('resolveScopes("calendar,photos") is the union with base scopes appearing exactly once', () => {
    const union = resolveScopes('calendar,photos');

    // Must contain the calendar scope
    assert.ok(union.includes('https://www.googleapis.com/auth/calendar'), 'Missing calendar scope');
    // Must contain both Photos scopes
    assert.ok(union.includes('https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata'), 'Missing photoslibrary scope');
    assert.ok(union.includes('https://www.googleapis.com/auth/photospicker.mediaitems.readonly'), 'Missing photospicker scope');
    // Base scopes must each appear exactly once
    for (const base of ['openid', 'email', 'profile']) {
        assert.equal(union.filter((s) => s === base).length, 1, `"${base}" must appear exactly once`);
    }
});

// --- Integration tests: invalid ?service returns 400 ---

const serverDir  = path.resolve(__dirname, '..');
const tmpDir     = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `google-scopes-${process.pid}-${Date.now()}.db`);
const keepArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port    = 5500 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;
let serverLogs = '';

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForServerReady(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const r = await fetch(`${baseUrl}/api/test`);
            if (r.ok) return;
        } catch { /* still starting */ }
        await delay(250);
    }
    throw new Error(`Server did not become ready within ${timeoutMs}ms.\n${serverLogs}`);
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
            ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (c) => { serverLogs += c.toString(); });
    serverProcess.stderr.on('data', (c) => { serverLogs += c.toString(); });

    await waitForServerReady();
});

test.after(async () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            serverProcess.once('close', resolve);
            setTimeout(resolve, 5000);
        });
    }

    if (!keepArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const p = `${testDbPath}${suffix}`;
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
    }
});

test('GET /api/connections/google/authorize with no service returns a URL covering all 6 scopes', async () => {
    // Seed dummy credentials so the route reaches scope resolution rather than
    // rejecting for missing OAuth config.
    await fetch(`${baseUrl}/api/connections/google/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'test-client-id.apps.googleusercontent.com', client_secret: 'test-secret' }),
    });

    const res  = await fetch(`${baseUrl}/api/connections/google/authorize`);
    const body = await res.json();

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(typeof body.url === 'string', `Expected url in response, got: ${JSON.stringify(body)}`);

    const authUrl    = new URL(body.url);
    const scopeParam = authUrl.searchParams.get('scope') || '';
    const granted    = scopeParam.split(' ');

    const ALL_SIX = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
        'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
    ];
    for (const scope of ALL_SIX) {
        assert.ok(granted.includes(scope), `Scope missing from authorize URL: ${scope}\nFull scope param: ${scopeParam}`);
    }
    assert.equal(granted.length, ALL_SIX.length, `Expected exactly 6 scopes, got ${granted.length}: ${scopeParam}`);
});

test('GET /api/connections/google/authorize?service=invalid returns 400', async () => {
    const res  = await fetch(`${baseUrl}/api/connections/google/authorize?service=invalid`);
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.ok(
        typeof body.error === 'string' && body.error.includes('invalid'),
        `Expected error message mentioning "invalid", got: ${JSON.stringify(body.error)}`
    );
});

test('GET /api/connections/google/authorize?service=calendar,bogus returns 400', async () => {
    const res  = await fetch(`${baseUrl}/api/connections/google/authorize?service=calendar%2Cbogus`);
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.ok(
        typeof body.error === 'string' && body.error.includes('bogus'),
        `Expected error message mentioning "bogus", got: ${JSON.stringify(body.error)}`
    );
});
