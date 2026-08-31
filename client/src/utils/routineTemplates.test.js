import { describe, it, expect } from 'vitest';
import { ROUTINE_TEMPLATES, buildRoutineFromTemplate } from './routineTemplates.js';

const echo = (key) => key;

const dictionary = {
  'routines:templates.morning.name': 'School day start',
  'routines:templates.morning.steps.bed': 'Make bed',
  'routines:templates.morning.steps.teeth': 'Brush teeth',
  'routines:templates.morning.steps.dressed': 'Get dressed',
  'routines:templates.morning.steps.backpack': 'Pack backpack',
  'routines:templates.bedtime.name': 'Bedtime',
  'routines:templates.bedtime.steps.pyjamas': 'Put on pyjamas',
  'routines:templates.bedtime.steps.teeth': 'Brush teeth',
  'routines:templates.bedtime.steps.tidy': 'Tidy up',
  'routines:templates.bedtime.steps.story': 'Story time',
  'routines:templates.afterschool.name': 'After school',
  'routines:templates.afterschool.steps.bag': 'Unpack bag',
  'routines:templates.afterschool.steps.lunchbox': 'Lunchbox out',
  'routines:templates.afterschool.steps.homework': 'Homework',
};
const translate = (key) => dictionary[key] ?? key;

describe('ROUTINE_TEMPLATES', () => {
  it('ships exactly three templates with stable ids', () => {
    expect(ROUTINE_TEMPLATES.map((r) => r.id)).toEqual(['morning', 'bedtime', 'afterschool']);
  });

  it('gives every step a title key and an emoji', () => {
    for (const template of ROUTINE_TEMPLATES) {
      expect(template.steps.length).toBeGreaterThan(0);
      for (const step of template.steps) {
        expect(typeof step.titleKey).toBe('string');
        expect(step.titleKey).toMatch(/^routines:templates\./);
        expect(typeof step.emoji).toBe('string');
        expect(step.emoji.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildRoutineFromTemplate', () => {
  it('returns null for a missing template', () => {
    expect(buildRoutineFromTemplate(null, echo)).toBeNull();
    expect(buildRoutineFromTemplate(undefined, echo)).toBeNull();
  });

  it('returns null when a template has no steps array', () => {
    expect(buildRoutineFromTemplate({ nameKey: 'x', steps: null }, echo)).toBeNull();
  });

  it('resolves the routine name and every step title through t', () => {
    const morning = ROUTINE_TEMPLATES.find((t) => t.id === 'morning');
    const result = buildRoutineFromTemplate(morning, translate);
    expect(result.name).toBe('School day start');
    expect(result.icon).toBe('⏰');
    expect(result.steps.map((s) => s.title)).toEqual([
      'Make bed',
      'Brush teeth',
      'Get dressed',
      'Pack backpack',
    ]);
  });

  it('carries each step emoji through as the icon', () => {
    const bedtime = ROUTINE_TEMPLATES.find((t) => t.id === 'bedtime');
    const result = buildRoutineFromTemplate(bedtime, translate);
    expect(result.steps.map((s) => s.icon)).toEqual(bedtime.steps.map((s) => s.emoji));
  });

  it('preserves array order via a zero-based position on every step', () => {
    const afterschool = ROUTINE_TEMPLATES.find((t) => t.id === 'afterschool');
    const result = buildRoutineFromTemplate(afterschool, translate);
    expect(result.steps.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('leaves the icon empty when the template omits one', () => {
    const template = {
      id: 'x',
      nameKey: 'k',
      steps: [{ titleKey: 'a', emoji: '⭐' }],
    };
    const result = buildRoutineFromTemplate(template, echo);
    expect(result.icon).toBe('');
  });

  it('falls back to the raw key when a translation is missing', () => {
    const template = {
      id: 'x',
      nameKey: 'routines:templates.missing.name',
      icon: '✨',
      steps: [{ titleKey: 'routines:templates.missing.step', emoji: '⭐' }],
    };
    const result = buildRoutineFromTemplate(template, echo);
    expect(result.name).toBe('routines:templates.missing.name');
    expect(result.steps[0].title).toBe('routines:templates.missing.step');
  });
});
