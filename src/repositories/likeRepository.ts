import { PrismaClient } from '@prisma/client';
import { socialTargetKey } from '../utils/social';

export class LikeRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** Batch like counts of many targets, keyed by `targetTypeId:targetId`. */
    async countByTargets(targetIds: number[]): Promise<Map<string, number>> {
        if (targetIds.length === 0) return new Map();

        const rows = await this.prisma.like.groupBy({
            by: ['targetTypeId', 'targetId'],
            where: { targetId: { in: targetIds } },
            _count: { _all: true },
        });

        return new Map(rows.map((row) => [socialTargetKey(row.targetTypeId, row.targetId), row._count._all]));
    }

    /** Keys of the targets the user has liked, as `targetTypeId:targetId`. */
    async likedTargetKeys(userId: string, targetIds: number[]): Promise<Set<string>> {
        if (targetIds.length === 0) return new Set();

        const rows = await this.prisma.like.findMany({
            where: { userId, targetId: { in: targetIds } },
            select: { targetTypeId: true, targetId: true },
        });

        return new Set(rows.map((row) => socialTargetKey(row.targetTypeId, row.targetId)));
    }

    /** One like per (user, target); a repeated like is ignored instead of failing. */
    async add(userId: string, targetTypeId: number, targetId: number): Promise<void> {
        await this.prisma.like.createMany({
            data: [{ userId, targetTypeId, targetId, createdAt: new Date() }],
            skipDuplicates: true,
        });
    }

    async remove(userId: string, targetTypeId: number, targetId: number): Promise<void> {
        await this.prisma.like.deleteMany({ where: { userId, targetTypeId, targetId } });
    }
}
