import { Prisma, PrismaClient } from '@prisma/client';

export interface CreatedReport {
    id: number;
    createdAt: Date | null;
}

export class ReportRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** `null` means the user already reported that target (live unique constraint). */
    async create(data: {
        userId: string;
        targetTypeId: number;
        targetId: number;
        reason: string | null;
    }): Promise<CreatedReport | null> {
        try {
            return await this.prisma.report.create({
                data: {
                    userId: data.userId,
                    targetTypeId: data.targetTypeId,
                    targetId: data.targetId,
                    reason: data.reason,
                    createdAt: new Date(),
                },
                select: { id: true, createdAt: true },
            });
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
            throw err;
        }
    }
}
