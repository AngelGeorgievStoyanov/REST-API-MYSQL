import { MODERATOR_ROLES } from './trip';

/** User administration only a full administrator may perform. */
export const ADMIN_ROLES = ['admin'];

/**
 * Administrative reads and log maintenance. The legacy handlers allowed
 * `admin` and `manager` here, so the restriction is preserved.
 */
export const ADMIN_OR_MODERATOR_ROLES = MODERATOR_ROLES;

/** Identity and credential fields are never settable through the admin update. */
export const CLIENT_CONTROLLED_USER_FIELDS = [
    'id',
    'email',
    'hashedPassword',
    'password',
    'imageFile',
    'verifyEmail',
    'emailVerifiedAt',
    'createdAt',
];
