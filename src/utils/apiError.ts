/** Error codes of the API error contract: `{ "error": { "code": ..., "message": ... } }`. */
export type ApiErrorCode =
    | 'VALIDATION_ERROR'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'TRIP_NOT_FOUND'
    | 'CONFLICT'
    | 'INTERNAL_SERVER_ERROR'
    | 'EMAIL_NOT_VERIFIED'
    | 'ACCOUNT_SUSPENDED'
    | 'ACCOUNT_DEACTIVATED';

export interface ApiErrorBody {
    error: {
        code: ApiErrorCode;
        message: string;
    };
}

/** Transport-agnostic API error; the middleware translates it into the HTTP response. */
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: ApiErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }

    static validation(message: string): ApiError {
        return new ApiError(400, 'VALIDATION_ERROR', message);
    }

    static unauthorized(message = 'Authentication required.'): ApiError {
        return new ApiError(401, 'UNAUTHORIZED', message);
    }

    static forbidden(message = 'Forbidden.'): ApiError {
        return new ApiError(403, 'FORBIDDEN', message);
    }

    static tripNotFound(message = 'Trip not found.'): ApiError {
        return new ApiError(404, 'TRIP_NOT_FOUND', message);
    }

    static notFound(message = 'Resource not found.'): ApiError {
        return new ApiError(404, 'NOT_FOUND', message);
    }

    static conflict(message: string): ApiError {
        return new ApiError(409, 'CONFLICT', message);
    }

    static internal(message = 'Internal server error.'): ApiError {
        return new ApiError(500, 'INTERNAL_SERVER_ERROR', message);
    }

    static invalidCredentials(message = 'Email or password is incorrect.'): ApiError {
        return new ApiError(401, 'UNAUTHORIZED', message);
    }

    /** Correct password, but the email verification flow was not completed. */
    static emailNotVerified(message = 'Email address is not verified yet.'): ApiError {
        return new ApiError(403, 'EMAIL_NOT_VERIFIED', message);
    }

    static accountSuspended(message = 'This account is suspended.'): ApiError {
        return new ApiError(403, 'ACCOUNT_SUSPENDED', message);
    }

    static accountDeactivated(message = 'This account is deactivated.'): ApiError {
        return new ApiError(403, 'ACCOUNT_DEACTIVATED', message);
    }

    /** Unknown verification/password-reset token. */
    static tokenInvalid(message = 'The token is invalid.'): ApiError {
        return new ApiError(400, 'VALIDATION_ERROR', message);
    }

    /** Verification/password-reset token past its expiration. */
    static tokenExpired(message = 'The token has expired.'): ApiError {
        return new ApiError(400, 'VALIDATION_ERROR', message);
    }

    /** Missing, unknown, expired or already rotated refresh session. */
    static refreshTokenInvalid(message = 'The refresh session is not valid.'): ApiError {
        return new ApiError(401, 'UNAUTHORIZED', message);
    }

    /** A revoked refresh token was presented again: the session chain is revoked. */
    static refreshTokenReused(message = 'The refresh session was already revoked. All sessions of this account were revoked.'): ApiError {
        return new ApiError(401, 'UNAUTHORIZED', message);
    }

    /** The account of a still valid access token no longer exists. */
    static accountGone(message = 'The authenticated account no longer exists.'): ApiError {
        return new ApiError(401, 'UNAUTHORIZED', message);
    }

    static emailDeliveryFailed(message = 'The email could not be sent. Please try again later.'): ApiError {
        return new ApiError(500, 'INTERNAL_SERVER_ERROR', message);
    }

    /** Rate-limit refusal; the contract has no 429, so the request is forbidden. */
    static rateLimited(message = 'Too many requests. Please try again later.'): ApiError {
        return new ApiError(403, 'FORBIDDEN', message);
    }
}

export function toApiErrorBody(error: ApiError): ApiErrorBody {
    return { error: { code: error.code, message: error.message } };
}
