import { PrismaClient } from '@prisma/client';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { deleteSocialRecordsForTargets, socialCleanupTargets } from './polymorphicTargets';

export interface ImageRow {
    id: number;
    filePath: string;
}

export class ImageRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** One bounded page of image paths, ordered by id for stable pagination. */
    async listFilePathsPage(skip: number, take: number): Promise<string[]> {
        const rows = await this.prisma.image.findMany({
            orderBy: { id: 'asc' },
            skip,
            take,
            select: { filePath: true },
        });

        return rows.map((row) => row.filePath);
    }

    async countImages(): Promise<number> {
        return this.prisma.image.count();
    }

    async findPathsForCloudObjects(objectPaths: string[]): Promise<string[]> {
        if (objectPaths.length === 0) return [];

        const originals = objectPaths.filter((objectPath) => !objectPath.endsWith('_thumb.webp'));
        const thumbnailStems = objectPaths
            .filter((objectPath) => objectPath.endsWith('_thumb.webp'))
            .map((objectPath) => objectPath.slice(0, -'_thumb.webp'.length) + '.');
        const where = [
            ...(originals.length > 0 ? [{ filePath: { in: originals } }] : []),
            ...thumbnailStems.map((stem) => ({ filePath: { startsWith: stem } })),
        ];
        const rows = await this.prisma.image.findMany({
            where: { OR: where },
            select: { filePath: true },
        });

        return rows.map((row) => row.filePath);
    }

    /**
     * The profile image of one account: an `images` row that belongs to the user
     * and to no trip or point. The live table has no exactly-one-parent
     * constraint, so the parent columns are filtered explicitly.
     */
    async findProfileImage(ownerId: string): Promise<ImageRow | null> {
        return this.prisma.image.findFirst({
            where: { ownerId, tripId: null, pointId: null },
            orderBy: { id: 'desc' },
            select: { id: true, filePath: true },
        });
    }

    async createProfileImage(ownerId: string, filePath: string): Promise<ImageRow> {
        return this.prisma.image.create({
            data: { ownerId, filePath, createdAt: new Date() },
            select: { id: true, filePath: true },
        });
    }

    async delete(imageId: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            // The image row (profile image or any other image without a day/point
            // parent) is removed together with every social record that targets it.
            await deleteSocialRecordsForTargets(tx, socialCleanupTargets(SOCIAL_TARGET_TYPE.IMAGE, [imageId]));

            await tx.image.delete({ where: { id: imageId }, select: { id: true } });
        });
    }
}
