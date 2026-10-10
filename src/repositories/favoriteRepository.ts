import { type PrismaClient } from '@prisma/client';

export class FavoriteRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** Batch favorite counts of many trip groups. */
    async countByGroups(groupIds: number[]): Promise<Map<number, number>> {
        if (groupIds.length === 0) return new Map();

        const rows = await this.prisma.favorite.groupBy({
            by: ['tripGroupId'],
            where: { tripGroupId: { in: groupIds } },
            _count: { _all: true },
        });

        return new Map(rows.map((row) => [row.tripGroupId, row._count._all]));
    }

    /** Trip groups the user has favorited. */
    async favoritedGroupIds(userId: string, groupIds: number[]): Promise<Set<number>> {
        if (groupIds.length === 0) return new Set();

        const rows = await this.prisma.favorite.findMany({
            where: { userId, tripGroupId: { in: groupIds } },
            select: { tripGroupId: true },
        });

        return new Set(rows.map((row) => row.tripGroupId));
    }

    /** Trip-group ids of the user's favorites, most recently added first. */
    async listFavoriteGroupIds(userId: string): Promise<number[]> {
        const rows = await this.prisma.favorite.findMany({
            where: { userId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { tripGroupId: true },
        });

        return rows.map((row) => row.tripGroupId);
    }

    /** One favorite per (user, trip group); a repeated favorite is ignored. */
    async add(userId: string, tripGroupId: number): Promise<void> {
        await this.prisma.favorite.createMany({
            data: [{ userId, tripGroupId, createdAt: new Date() }],
            skipDuplicates: true,
        });
    }

    async remove(userId: string, tripGroupId: number): Promise<void> {
        await this.prisma.favorite.deleteMany({ where: { userId, tripGroupId } });
    }
}
