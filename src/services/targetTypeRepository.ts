import { PrismaClient } from '@prisma/client';
import { SocialTargetType } from '../model/social';
import { ApiError } from '../utils/apiError';
import { isSocialTargetType } from '../utils/social';

/** `target_types.name` (only the social ones) mapped to their row ids. */
export type SocialTargetTypeIds = Map<SocialTargetType, number>;

export class TargetTypeRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** Small static lookup table, read once per request instead of per resource. */
    async loadIds(): Promise<SocialTargetTypeIds> {
        const rows = await this.prisma.targetType.findMany({ select: { id: true, name: true } });

        const ids: SocialTargetTypeIds = new Map();
        for (const row of rows) {
            if (isSocialTargetType(row.name)) ids.set(row.name, row.id);
        }
        return ids;
    }

    /** Reverse lookup for rows that only carry `targetTypeId`, such as a comment. */
    async loadNames(): Promise<Map<number, SocialTargetType>> {
        const ids = await this.loadIds();

        const names = new Map<number, SocialTargetType>();
        for (const [name, id] of ids) names.set(id, name);
        return names;
    }

    /** A missing target type row is a broken configuration, not client input. */
    async requireId(targetType: SocialTargetType): Promise<number> {
        const typeId = (await this.loadIds()).get(targetType);
        if (typeId === undefined) {
            throw ApiError.internal(`The target type "${targetType}" is missing in target_types.`);
        }
        return typeId;
    }
}
