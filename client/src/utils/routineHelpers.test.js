import { describe, it, expect } from 'vitest';
import {
  computeStripPlacement,
  occurrencesForDate,
  remainingRoutines,
  routineDayStatus,
} from './routineHelpers.js';

const routineOccurrence = (overrides = {}) => ({
  user_id: 1,
  summary: 'Morning routine',
  start: '2026-05-01T07:00:00.000Z',
  end: '2026-05-01T07:30:00.000Z',
  all_day: false,
  source: 'routine',
  routine_id: 10,
  icon: '🌅',
  date: '2026-05-01',
  ...overrides,
});

describe('computeStripPlacement', () => {
  it('places a strip at start time when start is set (case 3: start only)', () => {
    const placement = computeStripPlacement(routineOccurrence({ start_time: '07:00', end_time: null }));
    expect(placement).toEqual({ kind: 'timed', startTime: '07:00', endTime: null });
  });

  it('places a strip at start and carries end as an on-time marker (case 1: both set)', () => {
    const placement = computeStripPlacement(routineOccurrence({ start_time: '07:00', end_time: '07:30' }));
    expect(placement).toEqual({ kind: 'timed', startTime: '07:00', endTime: '07:30' });
  });

  it('renders as an all-day row when neither time is set (case 2: neither)', () => {
    const placement = computeStripPlacement(routineOccurrence({ start_time: null, end_time: null, all_day: true }));
    expect(placement).toEqual({ kind: 'allDay' });
  });

  it('renders as an all-day row labelled with the end time when only end is set (case 4: end only)', () => {
    const placement = computeStripPlacement(routineOccurrence({ start_time: null, end_time: '17:00', all_day: true }));
    expect(placement).toEqual({ kind: 'allDayByEnd', endTime: '17:00' });
  });

  it('ignores malformed HH:MM values rather than trusting them for geometry', () => {
    const placement = computeStripPlacement(routineOccurrence({ start_time: 'nope', end_time: '25:99' }));
    expect(placement).toEqual({ kind: 'allDay' });
  });

  it('tolerates a missing or non-object occurrence', () => {
    expect(computeStripPlacement(null)).toEqual({ kind: 'allDay' });
    expect(computeStripPlacement(undefined)).toEqual({ kind: 'allDay' });
  });
});

describe('occurrencesForDate', () => {
  it('keeps only routine occurrences on the requested date', () => {
    const occurrences = [
      routineOccurrence({ routine_id: 1, date: '2026-05-01' }),
      routineOccurrence({ routine_id: 2, date: '2026-05-02' }),
      { ...routineOccurrence({ routine_id: 3, date: '2026-05-01' }), source: 'chore' },
    ];
    const result = occurrencesForDate(occurrences, '2026-05-01');
    expect(result.map((o) => o.routine_id)).toEqual([1]);
  });

  it('sorts timed before end-only before fully all-day, then by time, then by summary', () => {
    const occurrences = [
      routineOccurrence({ routine_id: 1, summary: 'Bedtime', start_time: null, end_time: null, all_day: true }),
      routineOccurrence({ routine_id: 2, summary: 'After school', start_time: null, end_time: '17:00', all_day: true }),
      routineOccurrence({ routine_id: 3, summary: 'Wake up', start_time: '07:00', end_time: '07:30' }),
      routineOccurrence({ routine_id: 4, summary: 'Brunch', start_time: '11:00', end_time: null }),
      routineOccurrence({ routine_id: 5, summary: 'Anytime', start_time: null, end_time: null, all_day: true }),
    ];
    const result = occurrencesForDate(occurrences, '2026-05-01');
    expect(result.map((o) => o.routine_id)).toEqual([3, 4, 2, 5, 1]);
  });

  it('returns an empty list for a non-array or missing key', () => {
    expect(occurrencesForDate(null, '2026-05-01')).toEqual([]);
    expect(occurrencesForDate([routineOccurrence()], null)).toEqual([]);
  });
});

describe('remainingRoutines', () => {
  it('keeps routines whose progress has no recorded_completion, regardless of ticked step count', () => {
    const occurrences = [
      routineOccurrence({ routine_id: 1 }),
      routineOccurrence({ routine_id: 2 }),
      routineOccurrence({ routine_id: 3 }),
    ];
    const progressById = {
      1: { recorded_completion: false, done_steps: 3, total_steps: 4 },
      2: { recorded_completion: true, done_steps: 1, total_steps: 3 },
      3: { recorded_completion: false, done_steps: 0, total_steps: 2 },
    };
    const remaining = remainingRoutines(occurrences, progressById);
    expect(remaining.map((o) => o.routine_id)).toEqual([1, 3]);
  });

  it('trusts recorded_completion over the current ticked_step_ids count', () => {
    // A step was unticked after completion. The routine still reads as done.
    const occurrences = [routineOccurrence({ routine_id: 42 })];
    const progressById = {
      42: { recorded_completion: true, done_steps: 2, total_steps: 4 },
    };
    expect(remainingRoutines(occurrences, progressById)).toEqual([]);
  });

  it('ignores non-routine entries and missing progress rows', () => {
    const occurrences = [
      { ...routineOccurrence({ routine_id: 1 }), source: 'chore' },
      routineOccurrence({ routine_id: 2 }),
    ];
    const remaining = remainingRoutines(occurrences, {});
    expect(remaining.map((o) => o.routine_id)).toEqual([2]);
  });
});

describe('routineDayStatus', () => {
  it('reports "nothing-due" when no routines are scheduled', () => {
    expect(routineDayStatus([], {})).toBe('nothing-due');
    expect(routineDayStatus(null, {})).toBe('nothing-due');
  });

  it('reports "all-done" only when every routine has recorded a completion', () => {
    const occurrences = [
      routineOccurrence({ routine_id: 1 }),
      routineOccurrence({ routine_id: 2 }),
    ];
    const progressById = {
      1: { recorded_completion: true },
      2: { recorded_completion: true },
    };
    expect(routineDayStatus(occurrences, progressById)).toBe('all-done');
  });

  it('reports "remaining" as long as any routine has not recorded a completion', () => {
    const occurrences = [
      routineOccurrence({ routine_id: 1 }),
      routineOccurrence({ routine_id: 2 }),
    ];
    const progressById = {
      1: { recorded_completion: true },
      2: { recorded_completion: false },
    };
    expect(routineDayStatus(occurrences, progressById)).toBe('remaining');
  });

  it('keeps "nothing-due" and "all-done" as distinct states', () => {
    // The two happy states must not render identically — the child who did
    // nothing shouldn't get the same acknowledgement as the child who
    // finished everything.
    const scheduledAndDone = [routineOccurrence({ routine_id: 1 })];
    expect(routineDayStatus(scheduledAndDone, { 1: { recorded_completion: true } })).toBe('all-done');
    expect(routineDayStatus([], {})).toBe('nothing-due');
    expect(routineDayStatus([], {})).not.toBe(routineDayStatus(scheduledAndDone, { 1: { recorded_completion: true } }));
  });
});
