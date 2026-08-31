// One-at-a-time gate for confetti overlays.
//
// ChoreCelebration and PrizeCelebration are both portal-rendered to
// document.body at zIndex 10000. Two overlays firing at once double the
// visual noise (and, for PrizeCelebration, stack two identical cards); it is
// possible in one tap when the same action finishes both a routine and the
// day's chores, so this lock keeps the wall display legible.
//
// A caller asks for a slot with the kind of celebration it wants. If the slot
// is free, the caller fires and releases when the overlay dismisses. If a
// higher-tier celebration is already showing, the smaller one is suppressed —
// PrizeCelebration is the louder of the two and always wins.

const TIER = { chore: 1, prize: 2 };
let activeTier = 0;

export const acquireCelebration = (kind) => {
  const requested = TIER[kind] || 0;
  if (activeTier === 0 || requested > activeTier) {
    activeTier = requested;
    return true;
  }
  return false;
};

export const releaseCelebration = (kind) => {
  const releasing = TIER[kind] || 0;
  if (releasing >= activeTier) {
    activeTier = 0;
  }
};

// Test-only. Not called from production code.
export const _resetCelebrationLockForTests = () => {
  activeTier = 0;
};
