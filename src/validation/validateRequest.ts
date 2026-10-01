import { ZodType } from 'zod';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { VALIDATION_LIMITS } from '../constants/validation/limits';
import { ApiError } from '../utils/apiError';

export interface RequestSchemas {
    body?: ZodType;
    params?: ZodType;
    query?: ZodType;
}

/**
 * Validates the declared parts of the request and hands the parsed values to the
 * rest of the chain, so no slice ever reads unvalidated input.
 *
 * A rejected request is a `400 VALIDATION_ERROR` naming the offending field: the
 * message is derived from the schema, never from a thrown error, so no stack
 * trace, database detail or internal identifier can leak.
 */
export function validateRequest(schemas: RequestSchemas): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (schemas.body !== undefined) {
            const parsed = parse(schemas.body, req.body, next);
            if (parsed === undefined) return;
            req.body = parsed;
        }

        if (schemas.query !== undefined) {
            const parsed = parse(schemas.query, req.query, next);
            if (parsed === undefined) return;
            // Express types the parsed containers as index signatures; the value
            // written back is the schema output, which is what the slices must read.
            req.query = parsed as Request['query'];
        }

        if (schemas.params !== undefined) {
            const parsed = parse(schemas.params, req.params, next);
            if (parsed === undefined) return;
            req.params = parsed as Request['params'];
        }

        next();
    };
}

function parse(schema: ZodType, value: unknown, next: NextFunction): unknown {
    const result = schema.safeParse(value);
    if (result.success) return result.data;

    next(ApiError.validation(describeIssues(result.error.issues)));
    return undefined;
}

/** Client-safe description of the failures; nothing but the offending field. */
function describeIssues(issues: { path: PropertyKey[]; message: string }[]): string {
    const described = issues.map((issue) => {
        const field = issue.path.map(String).join('.');
        return field.length > 0 ? `"${field}": ${issue.message}` : issue.message;
    });

    return described.slice(0, VALIDATION_LIMITS.input.maxReportedIssues).join(' ');
}
