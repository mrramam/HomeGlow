import { describe, it, expect } from 'vitest';
import {
    GOOGLE_SCOPE_CALENDAR,
    GOOGLE_SCOPE_PHOTOS_APPCREATED,
    GOOGLE_SCOPE_PHOTOS_DEPRECATED,
    authorizeServiceParam,
    hasCalendarScope,
    hasDeprecatedPhotosScope,
    hasPhotosScope,
} from './googleScopes.js';

const CALENDAR_ONLY_SCOPES = [
    'openid',
    'email',
    'profile',
    GOOGLE_SCOPE_CALENDAR,
].join(' ');

const CALENDAR_AND_PHOTOS_SCOPES = [
    'openid',
    'email',
    'profile',
    GOOGLE_SCOPE_CALENDAR,
    GOOGLE_SCOPE_PHOTOS_APPCREATED,
    'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
].join(' ');

const DEPRECATED_PHOTOS_SCOPES = [
    'openid',
    'email',
    'profile',
    GOOGLE_SCOPE_CALENDAR,
    GOOGLE_SCOPE_PHOTOS_DEPRECATED,
].join(' ');

const CALENDAR_LOOKALIKE_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
].join(' ');

describe('hasCalendarScope', () => {
    it('returns true for a real 4-scope calendar-only string', () => {
        expect(hasCalendarScope(CALENDAR_ONLY_SCOPES)).toBe(true);
    });

    it('returns true for a real 6-scope calendar+photos string', () => {
        expect(hasCalendarScope(CALENDAR_AND_PHOTOS_SCOPES)).toBe(true);
    });

    it('returns false when only calendar.readonly / calendar.events are granted', () => {
        expect(hasCalendarScope(CALENDAR_LOOKALIKE_SCOPES)).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(hasCalendarScope('')).toBe(false);
    });

    it('returns false for null and undefined', () => {
        expect(hasCalendarScope(null)).toBe(false);
        expect(hasCalendarScope(undefined)).toBe(false);
    });
});

describe('hasPhotosScope', () => {
    it('returns true for a real 6-scope string with the appcreateddata scope', () => {
        expect(hasPhotosScope(CALENDAR_AND_PHOTOS_SCOPES)).toBe(true);
    });

    it('returns false for a calendar-only string', () => {
        expect(hasPhotosScope(CALENDAR_ONLY_SCOPES)).toBe(false);
    });

    it('returns false for an account holding only the deprecated photoslibrary.readonly scope', () => {
        expect(hasPhotosScope(DEPRECATED_PHOTOS_SCOPES)).toBe(false);
    });

    it('returns false for empty string, null, and undefined', () => {
        expect(hasPhotosScope('')).toBe(false);
        expect(hasPhotosScope(null)).toBe(false);
        expect(hasPhotosScope(undefined)).toBe(false);
    });
});

describe('hasDeprecatedPhotosScope', () => {
    it('returns true when only the old photoslibrary.readonly scope is present', () => {
        expect(hasDeprecatedPhotosScope(DEPRECATED_PHOTOS_SCOPES)).toBe(true);
    });

    it('returns false for an appcreateddata-only account (must not warn on healthy accounts)', () => {
        expect(hasDeprecatedPhotosScope(CALENDAR_AND_PHOTOS_SCOPES)).toBe(false);
    });

    it('returns false for a calendar-only account', () => {
        expect(hasDeprecatedPhotosScope(CALENDAR_ONLY_SCOPES)).toBe(false);
    });

    it('returns false when both the deprecated and current photos scopes are somehow present', () => {
        const bothScopes = `${DEPRECATED_PHOTOS_SCOPES} ${GOOGLE_SCOPE_PHOTOS_APPCREATED}`;
        expect(hasDeprecatedPhotosScope(bothScopes)).toBe(false);
    });

    it('returns false for empty string, null, and undefined', () => {
        expect(hasDeprecatedPhotosScope('')).toBe(false);
        expect(hasDeprecatedPhotosScope(null)).toBe(false);
        expect(hasDeprecatedPhotosScope(undefined)).toBe(false);
    });
});

describe('authorizeServiceParam', () => {
    it('returns "calendar,photos" when photos are included', () => {
        expect(authorizeServiceParam(true)).toBe('calendar,photos');
    });

    it('returns "calendar" when photos are excluded', () => {
        expect(authorizeServiceParam(false)).toBe('calendar');
    });
});
