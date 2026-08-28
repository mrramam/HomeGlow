const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;

try {
    console.log(`=== Starting Google scope sets schema migration to version ${targetSchemaId} ===`);

    db.exec('BEGIN');
    try {
        const stateColumns = db.prepare('PRAGMA table_info(google_oauth_states)').all().map((c) => c.name);
        if (!stateColumns.includes('service')) {
            db.exec("ALTER TABLE google_oauth_states ADD COLUMN service TEXT NOT NULL DEFAULT 'calendar,photos'");
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            schemaIdKey,
            String(targetSchemaId)
        );

        db.exec('COMMIT');
        console.log(`=== Google scope sets schema migration completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Google scope sets schema migration failed ===');
    console.error('Error:', error);
    throw error;
}
