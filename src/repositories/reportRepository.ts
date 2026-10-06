import { Prisma, PrismaClient } from '@prisma/client';
import { AdminReportRecord, CreatedReportRecord } from '../model/report';

export class ReportRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** `null` means the user already reported that target (live unique constraint). */
    async create(data: {
        userId: string;
        targetTypeId: number;
        targetId: number;
        reason: string | null;
    }): Promise<CreatedReportRecord | null> {
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

    /** One page of the moderation queue: newest reports first, tie-break by id. */
    async listPage(skip: number, take: number): Promise<AdminReportRecord[]> {
        return this.prisma.report.findMany({
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take,
            select: { id: true, targetTypeId: true, targetId: true, reason: true, createdAt: true },
        });
    }

    async countAll(): Promise<number> {
        return this.prisma.report.count();
    }

    /** `false` means the report no longer exists (already removed). */
    async delete(reportId: number): Promise<boolean> {
        try {
            await this.prisma.report.delete({ where: { id: reportId } });
            return true;
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return false;
            throw err;
        }
    }
}
