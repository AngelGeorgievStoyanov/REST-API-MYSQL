import { AuthActor, AuthSessionDto, AuthUserDto, AuthUserRecord, AuthUserResponse, MessageResponse, Permissions, ProfileDto, SessionPresenceResponse } from '../model/auth';

export function toSessionPresenceResponse(hasSession: boolean): SessionPresenceResponse {
    return { hasSession };
}

function toPermissions(role: string): Permissions | undefined {
    const isManager = role === 'manager';
    const isAdmin = role === 'admin';
    if (!isManager && !isAdmin) return undefined;

    return { isManager, isAdmin };
}

export function toProfileDto(user: AuthUserRecord): ProfileDto {
    const dto: ProfileDto = {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
    };

    const permissions = toPermissions(user.role);
    if (permissions) dto.permissions = permissions;

    return dto;
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
    return { user: toProfileDto(user) };
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
        user: toProfileDto(user),
    };
}