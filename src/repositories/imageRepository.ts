import { PrismaClient } from '@prisma/client';

export interface ImageRow {
    id: number;
    filePath: string;
}

export class ImageRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** Every file path the `images` table knows about, across all owners. */
    async listFilePaths(): Promise<string[]> {
        const rows = await this.prisma.image.findMany({ select: { filePath: true } });

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
        await this.prisma.image.delete({ where: { id: imageId }, select: { id: true } });
    }
}
