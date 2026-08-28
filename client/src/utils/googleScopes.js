export const GOOGLE_SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar';
export const GOOGLE_SCOPE_PHOTOS_APPCREATED =
    'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata';
export const GOOGLE_SCOPE_PHOTOS_DEPRECATED =
    'https://www.googleapis.com/auth/photoslibrary.readonly';

const CALENDAR_SCOPE_PATTERN = /\/auth\/calendar(\s|$)/;
const PHOTOS_APPCREATED_PATTERN = /photoslibrary\.readonly\.appcreateddata/;
const PHOTOS_DEPRECATED_PATTERN = /photoslibrary\.readonly(\s|$)/;

export const hasCalendarScope = (scopes) => {
    if (!scopes) return false;
    return CALENDAR_SCOPE_PATTERN.test(scopes);
};

export const hasPhotosScope = (scopes) => {
    if (!scopes) return false;
    return PHOTOS_APPCREATED_PATTERN.test(scopes);
};

export const hasDeprecatedPhotosScope = (scopes) => {
    if (!scopes) return false;
    return PHOTOS_DEPRECATED_PATTERN.test(scopes) && !PHOTOS_APPCREATED_PATTERN.test(scopes);
};

export const authorizeServiceParam = (includePhotos) =>
    includePhotos ? 'calendar,photos' : 'calendar';
