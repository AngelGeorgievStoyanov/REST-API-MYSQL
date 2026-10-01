import { ImageInventoryComparison } from '../model/image';

export function toImageInventoryComparison(input: {
    cloudOnly: string[];
    databaseOnly: string[];
    page: number;
    pageSize: number;
    cloudHasNext: boolean;
    databaseHasNext: boolean;
    databaseTotal: number;
}): ImageInventoryComparison {
    return {
        cloudOnly: input.cloudOnly,
        databaseOnly: input.databaseOnly,
        pagination: {
            page: input.page,
            pageSize: input.pageSize,
            cloudHasNext: input.cloudHasNext,
            databaseHasNext: input.databaseHasNext,
            databaseTotal: input.databaseTotal,
            databaseTotalPages: input.databaseTotal === 0 ? 0 : Math.ceil(input.databaseTotal / input.pageSize),
        },
    };
}