import { adminPaginationQuerySchema } from '../validation/schemas/admin.schemas';
import { ApiError } from './apiError';

export interface AdminPagination {
    page: number;
    pageSize: number;
    skip: number;
}

export function parseAdminPagination(query: unknown): AdminPagination {
    const result = adminPaginationQuerySchema.safeParse(query);
    if (!result.success) {
        const issue = result.error.issues[0];
        if (issue === undefined) throw ApiError.validation('Invalid pagination.');

        const field = issue.path.map(String).join('.');
        const detail = issue.message;
        throw ApiError.validation(field ? `"${field}": ${detail}` : detail);
    }

    const { page, pageSize } = result.data;
    return { page, pageSize, skip: (page - 1) * pageSize };
}
