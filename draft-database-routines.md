<!-- Rehome target: docs/architecture/database.md
     Add the schemaId 27 row to the versioned-migrations table (after the
     schemaId 25 row), and append the "Routines" subsection at the end of
     "Current schema (post-migration state)" (before "Encryption of stored
     credentials"). -->

### Add to the versioned-migrations table (after schemaId 25)

| 27 | `schema27-routines.js` | Adds the Routines feature: `routines`, `steps`, `routine_steps`, `routine_progress`. Also adds a nullable `chore_history.routine_id` (FK to `routines`) and a partial unique index `(routine_id, date) WHERE routine_id IS NOT NULL` so one routine completion produces exactly one ledger row. Number 26 is intentionally skipped — reserved for an unsubmitted branch. |

### New subsection: Routines

Routines sit **beside** chores, not on top of them. A routine is a named,
ordered checklist a kid works through — "Get your school day started": make
bed, brush teeth, pack backpack. It is scheduled with a crontab like a
calendar entry and completed by ticking every step; the ledger effect is a
single `chore_history` row with `kind='routine'` (and a `kind='streak'` row
when the streak hits a bonus multiple).

**`routines`** — the checklist definition and its schedule.
```
id, user_id ─▶ users(id) ON DELETE SET NULL (nullable = shared/unassigned),
name, icon,
visible (0|1),
crontab,                       -- when the routine is scheduled (Mon-Fri: '0 0 * * 1-5')
start_time,                    -- 'HH:MM' 24h local, nullable (all-day if both null)
end_time,                      -- 'HH:MM' 24h local, nullable
streak_bonus_every,            -- pay a bonus at every N-th consecutive scheduled completion
streak_bonus_clams,            -- amount awarded when the multiple is hit
current_streak,                -- persisted count; NEVER recomputed against a new schedule
last_completion_date,          -- 'YYYY-MM-DD' of the most recent completion (drives streak arithmetic)
created_at
```

**`steps`** — the library of step titles + optional emoji. Steps are shared
across routines (a step is a title, not a routine-specific row).
```
id, title, icon, created_at
```

**`routine_steps`** — ordered membership of a step in a routine.
```
id, routine_id ─▶ routines(id) CASCADE, step_id ─▶ steps(id) CASCADE,
position                       -- 0-based; reorder swaps positions
UNIQUE(routine_id, step_id)
```

**`routine_progress`** — one row per (routine, step, date) tick.
```
id, routine_id ─▶ routines(id) CASCADE, step_id ─▶ steps(id) CASCADE,
date,                          -- local 'YYYY-MM-DD'
created_at
UNIQUE(routine_id, step_id, date)
```

The UNIQUE constraint makes double-taps on a wall display idempotent — a
second tick returns without side effects. Unticking a step deletes the row
but never retracts a recorded completion or its clams: the `chore_history`
ledger is append-only.

**Streak semantics.** The streak counts **consecutive scheduled
occurrences**, not calendar days — so a Monday-to-Friday routine bridges
Friday to Monday without breaking. On each new completion the server
compares the previous scheduled date (per the routine's current crontab) to
`last_completion_date`; equal → increment, otherwise → reset to 1. History
is never re-scanned, so changing a routine's schedule mid-streak keeps the
existing count and lets the next completion carry on from there.
