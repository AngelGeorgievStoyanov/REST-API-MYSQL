import { AuthActor, AuthSessionDto, AuthUserDto, AuthUserRecord, AuthUserResponse, MessageResponse, SessionPresenceResponse } from '../model/auth';

export function toSessionPresenceResponse(hasSession: boolean): SessionPresenceResponse {
    return { hasSession };
}

export function toAuthUserDto(user: AuthUserRecord): AuthUserDto {
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerifiedAt !== null,
    };
}

export function toAuthUserResponse(user: AuthUserRecord): AuthUserResponse {
    return { user: toAuthUserDto(user) };
}

export function toAuthUserDtoList(users: AuthUserRecord[]): AuthUserDto[] {
    return users.map(toAuthUserDto);
}

export function toMessageResponse(message: string): MessageResponse {
    return { message };
}

export function toPasswordCheckResponse(valid: boolean): { valid: boolean } {
    return { valid };
}

export function toAuthActor(user: AuthUserRecord): AuthActor {
    return { id: user.id, role: user.role };
}

export function toAuthSessionDto(user: AuthUserRecord, accessToken: string, expiresIn: number): AuthSessionDto {
    return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn,
        user: toAuthUserDto(user),
    };
}