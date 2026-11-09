/** Permissions for the authenticated caller, surfaced on self-profile responses. */
export interface Permissions {
  isManager: boolean;
  isAdmin: boolean;
}

/**
 * Self-facing representation of the authenticated account. Never carries the
 * user UUID, DB role, status, or verification flags — those are computed as
 * `permissions` (for elevated accounts only) and are never trusted from the
 * client.
 */
export interface ProfileDto {
  email: string;
  firstName: string;
  lastName: string;
  permissions?: Permissions;
}

/** Public representation of the authenticated account; never carries the hash. */
export interface AuthUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  countOfLogs: number | null;
  lastTimeLogin: string | null;
}

/** Internal authenticated account record; password hashes never reach the API mapper output. */
export interface AuthUserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  hashedPassword: string;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  countOfLogs: bigint | null;
  lastTimeLogin: string | null;
}

/** Identity of the authenticated actor, always resolved from the database row. */
export interface AuthActor {
  id: string;
  role: string;
}

export interface AuthSessionDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: ProfileDto;
}

export interface AuthUserResponse {
  user: ProfileDto;
}

export interface MessageResponse {
  message: string;
}

export interface SessionPresenceResponse {
  hasSession: boolean;
}
