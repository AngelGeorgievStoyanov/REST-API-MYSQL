import { MODERATOR_ROLES } from './trip';

/** User administration only a full administrator may perform. */
export const ADMIN_ROLES = ['admin'];

/**
 * Administrative reads and log maintenance. The legacy handlers allowed
 * `admin` and `manager` here, so the restriction is preserved.
 */
export const ADMIN_OR_MODERATOR_ROLES = MODERATOR_ROLES;

/** Identity and credential fields never settable directly through the admin update. */
export const CLIENT_CONTROLLED_USER_FIELDS = [
    'id',
    'hashedPassword',
    'imageFile',
    'verifyEmail',
    'emailVerifiedAt',
    'createdAt',
];

/** Per-IP request ceiling of the administrative surface inside one rate-limit window. */
export const ADMIN_RATE_LIMIT_MAX = 120;

/**
 * `users.role` values an administrator may assign. The `satisfies` guard fails
 * the build if the Prisma enum ever drops one of them.
 */
export const ASSIGNABLE_USER_ROLES = ['user', 'admin', 'manager'] as const;

/** `users.status` values an administrator may assign. */
export const ASSIGNABLE_USER_STATUSES = [
    'PENDING_VERIFICATION',
    'ACTIVE',
    'SUSPENDED',
    'DEACTIVATED',
] as const;
