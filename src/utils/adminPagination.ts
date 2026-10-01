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
        const field = issue?.path.map(String).join('.') ?? '';
        throw ApiError.validation(field ? `"${field}": ${issue.message}` : issue?.message ?? 'Invalid pagination.');
    }

    const { page, pageSize } = result.data;
    return { page, pageSize, skip: (page - 1) * pageSize };
}
