const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting routines schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        // Routines sit BESIDE chores — a named, ordered checklist scheduled
        // like a calendar entry. Not built from chore_schedules. Nothing here
        // touches the chores or chore_schedules tables; the only chore-side
        // reach is the routine_id column added to the chore_history LEDGER so
        // one routine completion produces one ledger row (via the partial
        // unique index below), the same append-only shape the rest of the
        // ledger already uses.
        db.exec(`
            CREATE TABLE IF NOT EXISTS routines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NULL,
                name TEXT NOT NULL,
                icon TEXT,
                visible INTEGER NOT NULL DEFAULT 1,
                crontab TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                streak_bonus_every INTEGER NOT NULL DEFAULT 0,
                streak_bonus_clams INTEGER NOT NULL DEFAULT 0,
                current_streak INTEGER NOT NULL DEFAULT 0,
                last_completion_date TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_routines_user_id ON routines(user_id);
            CREATE INDEX IF NOT EXISTS idx_routines_visible ON routines(visible);

            CREATE TABLE IF NOT EXISTS steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                icon TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS routine_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                routine_id INTEGER NOT NULL,
                step_id INTEGER NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
                FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
                UNIQUE(routine_id, step_id)
            );
            CREATE INDEX IF NOT EXISTS idx_routine_steps_routine_id ON routine_steps(routine_id);

            CREATE TABLE IF NOT EXISTS routine_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                routine_id INTEGER NOT NULL,
                step_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
                FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
                UNIQUE(routine_id, step_id, date)
            );
            CREATE INDEX IF NOT EXISTS idx_routine_progress_routine_date ON routine_progress(routine_id, date);
        `);

        // Ledger link back to the routine. Nullable — every existing row (and
        // every chore completion) leaves it NULL. ALTER TABLE has no
        // IF NOT EXISTS, so guard on the column list to keep the migration
        // replayable if SYSTEM_SCHEMA_ID is ever reset.
        const historyColumns = db.prepare('PRAGMA table_info(chore_history)').all().map((c) => c.name);
        if (!historyColumns.includes('routine_id')) {
            db.exec('ALTER TABLE chore_history ADD COLUMN routine_id INTEGER NULL REFERENCES routines(id) ON DELETE SET NULL');
        }

        // Partial unique index = one completion row per (routine, date),
        // matching the append-only ledger idiom already used for the missed
        // logger. A double-tap on a wall display becomes a no-op INSERT OR
        // IGNORE, not a duplicate ledger row.
        //
        // Deliberately scoped by routine_id IS NOT NULL rather than
        // kind='routine' so the migration-20 regression test can still DROP
        // COLUMN kind on a downgraded DB — SQLite refuses DROP COLUMN if a
        // partial index references it. Streak bonus rows (kind='streak')
        // therefore write routine_id NULL and are traceable via kind + title
        // instead.
        db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_chore_history_routine_unique
              ON chore_history(routine_id, date) WHERE routine_id IS NOT NULL
        `);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Routines schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Routines schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
