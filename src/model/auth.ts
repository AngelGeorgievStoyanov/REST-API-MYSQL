/** Public representation of the authenticated account; never carries the hash. */
export interface AuthUserDto {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
    emailVerified: boolean;
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
    user: AuthUserDto;
}

export interface AuthUserResponse {
    user: AuthUserDto;
}

export interface MessageResponse {
    message: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface VerifyEmailRequest {
    token: string;
}

export interface EmailRequest {
    email: string;
}

export interface ResetPasswordRequest {
    token: string;
    password: string;
}
