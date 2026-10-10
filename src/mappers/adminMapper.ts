import { type AdminPage, type DeleteCountResponse } from '../model/admin';

export function toAdminPageDto<T>(items: T[], total: number, page: number, pageSize: number): AdminPage<T> {
    return {
        items,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        },
    };
}

export function toAdminCursorPageDto<T>(items: T[], page: number, pageSize: number, hasNext: boolean): AdminPage<T> {
    return { items, pagination: { page, pageSize, hasNext } };
}

export function toDeleteCountResponse(deleted: number): DeleteCountResponse {
    return { deleted };
}