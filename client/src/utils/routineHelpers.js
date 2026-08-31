// Pure helpers for the routines surfaces.
//
// The list surface (RoutineChecklist), the per-child widget (RoutineWidget) and
// the calendar strips all read the same occurrence and progress shapes, so the
// filtering, sorting and placement rules live here — the components stay thin
// callers and this file carries the whole test story.

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidHHMM = (value) => typeof value === 'string' && HHMM_RE.test(value);

/**
 * Where a routine strip goes on the calendar's week view. `end_time` is
 * metadata, never geometry: a two-hour block is wrong for something that
 * renders a few pixels tall, so end_time only ever becomes an on-time marker
 * or the "by <end>" label — never a span.
 *
 * Four cases the caller must handle:
 *   { kind: 'timed', startTime, endTime|null } — slim strip at startTime
 *   { kind: 'allDay' }                         — full-width all-day row
 *   { kind: 'allDayByEnd', endTime }           — all-day row labelled "by <end>"
 */
export const computeStripPlacement = (occurrence) => {
  const startTime = isValidHHMM(occurrence?.start_time) ? occurrence.start_time : null;
  const endTime = isValidHHMM(occurrence?.end_time) ? occurrence.end_time : null;

  if (startTime) return { kind: 'timed', startTime, endTime };
  if (endTime) return { kind: 'allDayByEnd', endTime };
  return { kind: 'allDay' };
};

/**
 * Routine occurrences on the given YYYY-MM-DD, sorted for display: timed
 * strips first (by startTime), then end-only strips (by endTime), then fully
 * all-day. Ties break on summary so the order is stable across renders.
 */
export const occurrencesForDate = (occurrences, dateKey) => {
  if (!Array.isArray(occurrences) || !dateKey) return [];
  return occurrences
    .filter((o) => o && o.source === 'routine' && o.date === dateKey)
    .slice()
    .sort((a, b) => {
      const placementA = computeStripPlacement(a);
      const placementB = computeStripPlacement(b);
      const bucket = (p) => (p.kind === 'timed' ? 0 : p.kind === 'allDayByEnd' ? 1 : 2);
      if (bucket(placementA) !== bucket(placementB)) {
        return bucket(placementA) - bucket(placementB);
      }
      const timeA = placementA.startTime || placementA.endTime || '';
      const timeB = placementB.startTime || placementB.endTime || '';
      if (timeA !== timeB) return timeA < timeB ? -1 : 1;
      return String(a.summary || '').localeCompare(String(b.summary || ''));
    });
};

/**
 * Occurrences the child still has to do. `recorded_completion` is
 * authoritative — a routine that finished stays done even if a step is later
 * unticked, so the wall display can't flicker in and out of its finished state.
 */
export const remainingRoutines = (occurrences, progressById) => {
  if (!Array.isArray(occurrences)) return [];
  return occurrences.filter((occurrence) => {
    if (!occurrence || occurrence.source !== 'routine' || occurrence.routine_id == null) {
      return false;
    }
    const progress = progressById?.[occurrence.routine_id];
    return !progress?.recorded_completion;
  });
};

/**
 * Which of three states the RoutineWidget should render.
 *
 *   'nothing-due' — no routines scheduled today (Saturday-quiet)
 *   'all-done'    — routines existed and all are recorded complete
 *   'remaining'   — at least one still open
 *
 * The two "happy" states are deliberately distinct: rendering both as the same
 * cheerful mark gives the child who did nothing the same acknowledgement as
 * the child who finished everything.
 */
export const routineDayStatus = (occurrences, progressById) => {
  const relevant = Array.isArray(occurrences)
    ? occurrences.filter((o) => o && o.source === 'routine' && o.routine_id != null)
    : [];
  if (relevant.length === 0) return 'nothing-due';
  return remainingRoutines(relevant, progressById).length === 0 ? 'all-done' : 'remaining';
};
