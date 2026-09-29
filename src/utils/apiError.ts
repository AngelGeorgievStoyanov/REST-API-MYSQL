/** Error codes of the API error contract: `{ "error": { "code": ..., "message": ... } }`. */
export type ApiErrorCode =
    | 'VALIDATION_ERROR'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'TRIP_NOT_FOUND'
    | 'CONFLICT'
    | 'INTERNAL_SERVER_ERROR';

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

    static conflict(message: string): ApiError {
        return new ApiError(409, 'CONFLICT', message);
    }

    static internal(message = 'Internal server error.'): ApiError {
        return new ApiError(500, 'INTERNAL_SERVER_ERROR', message);
    }
}

export function toApiErrorBody(error: ApiError): ApiErrorBody {
    return { error: { code: error.code, message: error.message } };
}
