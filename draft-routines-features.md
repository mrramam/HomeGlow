<!--
  Rehome target: docs/reference/features.md
  Insert this ## Routines section immediately BEFORE the existing "## Calendar"
  heading (currently at line 172), between the Metrics-ready history subsection
  and Calendar. Do not create a new heading level or nest under Chores — routines
  are their own feature area.
-->

## Routines

A **routine** is a named, ordered checklist a child works through — for example,
"School day start": make bed, brush teeth, get dressed, pack backpack. Routines
sit **beside** chores and are not built from them: they are scheduled like a
calendar entry (days of the week, optional start/end time), completed by ticking
every step, and rewarded through streaks (`streak_bonus_every` completions grant
`streak_bonus_clams` clams).

- **Steps are shared library entries**: the same step (e.g. "brush teeth") can
  appear in more than one routine. Editing a step in the editor changes it
  everywhere it is used — the step editor surfaces the current usage count
  before saving so the fan-out is never silent.
- **Cross-namespace autocomplete**: naming a step suggests titles from both the
  existing step library and the existing chore library (via `GET /api/task-titles`).
  Suggestions only — duplicates are never blocked. This is the agreed mitigation
  for the same real-world task drifting into two spellings across the two name
  spaces.
- **Icons** come from the shared `CHORE_ICON_GROUPS` bank in
  `utils/choreIcons.js`; the emoji character is persisted directly, so a routine
  or a step can outlive any single revision of the bank.
- **Templates** (client-side only) — three ready-made starting points: *School
  day start*, *Bedtime*, *After school*. Picking a template pre-fills the editor
  with a name, icon and ordered steps; the user then chooses the child and
  schedule and saves. The server never learns templates exist — everything routes
  through the same `POST /api/routines` and `POST /api/routines/:id/steps`
  endpoints an editor uses when building one from scratch.

The editor lives in **Admin Panel → Chores → Routines** (a fourth sub-tab
alongside Chores, History, Settings — not a ninth top-level admin tab, since
those already overflow on narrow screens).

**Code:** `components/RoutinesTab.jsx`, `utils/routineTemplates.js` (+ its
tests); the routines/steps/task-titles routes in `server/index.js`.
