import { type PrismaClient } from '@prisma/client';
import { socialTargetKey } from '../utils/social';

export class FavoriteRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async countByTargets(targetTypeIds: Map<string, number>, targets: { targetType: string; targetId: number }[]): Promise<Map<string, number>> {
        if (targets.length === 0) return new Map();
        const rows = await this.prisma.favorite.groupBy({
            by: ['targetTypeId', 'targetId'],
            where: { OR: targets.flatMap((target) => {
                const targetTypeId = targetTypeIds.get(target.targetType);
                return targetTypeId === undefined ? [] : [{ targetTypeId, targetId: target.targetId }];
            }) },
            _count: { _all: true },
        });
        return new Map(rows.map((row) => [socialTargetKey(row.targetTypeId, row.targetId), row._count._all]));
    }

    async favoritedTargetKeys(userId: string, targets: { targetType: string; targetId: number }[], targetTypeIds: Map<string, number>): Promise<Set<string>> {
        if (targets.length === 0) return new Set();
        const rows = await this.prisma.favorite.findMany({
            where: { userId, OR: targets.flatMap((target) => {
                const targetTypeId = targetTypeIds.get(target.targetType);
                return targetTypeId === undefined ? [] : [{ targetTypeId, targetId: target.targetId }];
            }) },
            select: { targetTypeId: true, targetId: true },
        });
        return new Set(rows.map((row) => socialTargetKey(row.targetTypeId, row.targetId)));
    }

    async listFavoriteGroupIds(userId: string): Promise<number[]> {
        const targetType = await this.prisma.targetType.findUnique({ where: { name: 'tripGroup' }, select: { id: true } });
        if (!targetType) return [];
        const rows = await this.prisma.favorite.findMany({ where: { userId, targetTypeId: targetType.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { targetId: true } });
        return rows.map((row) => row.targetId);
    }

    async add(userId: string, targetTypeId: number, targetId: number): Promise<void> {
        await this.prisma.favorite.createMany({ data: [{ userId, targetTypeId, targetId, createdAt: new Date() }], skipDuplicates: true });
    }

    async remove(userId: string, targetTypeId: number, targetId: number): Promise<void> {
        await this.prisma.favorite.deleteMany({ where: { userId, targetTypeId, targetId } });
    }
}
