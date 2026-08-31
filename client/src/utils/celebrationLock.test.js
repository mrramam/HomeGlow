import { describe, it, expect, beforeEach } from 'vitest';
import {
  acquireCelebration,
  releaseCelebration,
  _resetCelebrationLockForTests,
} from './celebrationLock.js';

describe('celebrationLock', () => {
  beforeEach(() => {
    _resetCelebrationLockForTests();
  });

  describe('unmount-release semantics', () => {
    it('a holder that releases on unmount frees the lock for a later acquire', () => {
      // Component acquires and then unmounts without a dismiss — the unmount
      // cleanup fires releaseCelebration because holdingRef.current was set.
      expect(acquireCelebration('chore')).toBe(true);
      releaseCelebration('chore'); // unmount cleanup path
      expect(acquireCelebration('chore')).toBe(true);
    });

    it('a non-holder calling release clears a lock it did not own', () => {
      // This documents the hazard the holdingRef guard in each component
      // prevents. Without the guard, a component that never acquired could
      // call releaseCelebration on unmount and silently clear another
      // component's live overlay.
      expect(acquireCelebration('prize')).toBe(true);

      // Simulates the old unconditional releaseCelebration('prize') call.
      releaseCelebration('prize');

      // Lock is now gone — the next acquire wrongly succeeds.
      expect(acquireCelebration('chore')).toBe(true);
    });

    it('a non-holder that skips release leaves the lock intact', () => {
      // With the holdingRef guard, a component whose ref is false does not
      // call releaseCelebration on unmount, so the rightful holder's lock
      // survives the unmount.
      expect(acquireCelebration('prize')).toBe(true);

      // No release — non-holder skips (holdingRef.current === false).

      // A lower-tier acquire is still suppressed.
      expect(acquireCelebration('chore')).toBe(false);
    });
  });

  describe('tier behaviour', () => {
    it('prize outranks chore — chore cannot acquire while prize is active', () => {
      expect(acquireCelebration('prize')).toBe(true);
      expect(acquireCelebration('chore')).toBe(false);
    });

    it('prize can override an active chore slot', () => {
      expect(acquireCelebration('chore')).toBe(true);
      expect(acquireCelebration('prize')).toBe(true);
    });

    it('releasing prize clears the lock regardless of prior chore activity', () => {
      acquireCelebration('chore');
      acquireCelebration('prize'); // overrides
      releaseCelebration('prize');
      expect(acquireCelebration('chore')).toBe(true);
    });

    it('releasing a lower tier than active does not clear the lock', () => {
      expect(acquireCelebration('prize')).toBe(true);
      releaseCelebration('chore'); // tier 1 < active tier 2 — no-op
      expect(acquireCelebration('chore')).toBe(false); // prize still holds
    });
  });
});
