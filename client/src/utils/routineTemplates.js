// Ready-made starting points for the Routines editor.
//
// A template is inert data: an id, a name key, an ordered list of step keys
// and their emoji. Picking one produces an in-memory payload the editor loads
// into its form fields — the server has no notion of templates and only ever
// sees ordinary POST /api/routines + POST /api/routines/:id/steps calls.
//
// Strings live under the `routines` namespace so translators can transcreate
// each step title independently. Emoji are literal, drawn from CHORE_ICON_GROUPS
// so steps, chores and templates share one vocabulary.

export const ROUTINE_TEMPLATES = [
  {
    id: 'morning',
    nameKey: 'routines:templates.morning.name',
    icon: '⏰',
    steps: [
      { titleKey: 'routines:templates.morning.steps.bed', emoji: '🛏️' },
      { titleKey: 'routines:templates.morning.steps.teeth', emoji: '🪥' },
      { titleKey: 'routines:templates.morning.steps.dressed', emoji: '👕' },
      { titleKey: 'routines:templates.morning.steps.backpack', emoji: '🎒' },
    ],
  },
  {
    id: 'bedtime',
    nameKey: 'routines:templates.bedtime.name',
    icon: '🛏️',
    steps: [
      { titleKey: 'routines:templates.bedtime.steps.pyjamas', emoji: '👕' },
      { titleKey: 'routines:templates.bedtime.steps.teeth', emoji: '🪥' },
      { titleKey: 'routines:templates.bedtime.steps.tidy', emoji: '🧸' },
      { titleKey: 'routines:templates.bedtime.steps.story', emoji: '📖' },
    ],
  },
  {
    id: 'afterschool',
    nameKey: 'routines:templates.afterschool.name',
    icon: '🎒',
    steps: [
      { titleKey: 'routines:templates.afterschool.steps.bag', emoji: '🎒' },
      { titleKey: 'routines:templates.afterschool.steps.lunchbox', emoji: '🍽️' },
      { titleKey: 'routines:templates.afterschool.steps.homework', emoji: '📝' },
    ],
  },
];

// Pure — takes a template and a translator, returns the seed the editor loads
// into its form. `t` is normally i18next's `t`; the tests pass a fake so the
// helper stays free of the React/i18n runtime. Step order is the array order.
export function buildRoutineFromTemplate(template, t) {
  if (!template || !Array.isArray(template.steps)) return null;
  return {
    name: t(template.nameKey),
    icon: template.icon || '',
    steps: template.steps.map((step, position) => ({
      title: t(step.titleKey),
      icon: step.emoji || '',
      position,
    })),
  };
}
