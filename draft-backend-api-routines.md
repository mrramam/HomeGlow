<!-- Rehome target: docs/reference/backend-api.md
     Insert a new subsection under "REST API surface" (near the chores block,
     after "Chores, schedules & history"). -->

### Routines, steps & occurrences

Routines are a checklist-style scheduled task that lives beside chores
(never built from them). Completing every step of a routine writes one
append-only `chore_history` row (`kind='routine'`, `clam_value=0`); when
the consecutive-scheduled-occurrence streak hits a bonus multiple, an
additional `kind='streak'` row awards clams. See
[`docs/architecture/database.md`](../architecture/database.md#routines).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/routines` | List routines with their ordered steps. Optional `?user_id=` and `?visible=` filters. |
| POST | `/api/routines` | Create a routine: `{name, user_id?, icon?, visible?, crontab, start_time?, end_time?, streak_bonus_every?, streak_bonus_clams?}`. |
| GET | `/api/routines/:id` | Single routine + steps. |
| PATCH | `/api/routines/:id` | Update fields. Persisted streak is not recomputed against the new schedule. |
| DELETE | `/api/routines/:id` | Delete a routine (cascades `routine_steps` and `routine_progress`). |
| POST | `/api/routines/:id/steps` | Add a step: `{step_id}` to attach an existing step, or `{title, icon?}` to create + attach. Optional `position`. |
| PATCH | `/api/routines/:id/steps/reorder` | Reorder: `{orderedStepIds: [id, …]}` must list every current step exactly once. |
| DELETE | `/api/routines/:id/steps/:stepId` | Remove step from routine. |
| GET | `/api/steps` | List the shared step library. |
| POST | `/api/steps` | Create a step: `{title, icon?}`. |
| PATCH/DELETE | `/api/steps/:id` | Update / delete a shared step (delete cascades removals from routines). |
| POST | `/api/routines/:routineId/steps/:stepId/tick` | Mark a step done today: `{user_id?}`. Idempotent (a re-tap is a no-op). When every step is done, records one `chore_history` row and advances the streak; awards a streak bonus when applicable. Rejects dates other than today. |
| DELETE | `/api/routines/:routineId/steps/:stepId/tick` | Untick a step for today (`?date=` optional, must be today). Never retracts a recorded completion or its clams. |
| GET | `/api/routines/:id/progress` | Today's tick state (`?date=` overrideable): `{ticked_step_ids, total_steps, done_steps, complete, recorded_completion, current_streak, last_completion_date}`. |
| GET | `/api/routine-occurrences` | Synth calendar-shape occurrences for a range: `?start=YYYY-MM-DD&end=YYYY-MM-DD` (`?user_id=` optional). Returns `[{user_id, summary, start, end, all_day, source: 'routine', routine_id, icon, date}]` sorted by start. |
| GET | `/api/task-titles` | Cross-namespace autocomplete: `[{title, icon, source: 'step'\|'chore'}]` merged from `steps` and `chores`, sorted by title. |
