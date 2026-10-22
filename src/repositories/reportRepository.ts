import { Prisma, type PrismaClient } from '@prisma/client';
import { type AdminReportRecord, type CreatedReportRecord } from '../model/report';
import { socialTargetKey } from '../utils/social';

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

    /** Keys of the targets the user has reported, as `targetTypeId:targetId`. */
    async reportedTargetKeys(userId: string, targetIds: number[]): Promise<Set<string>> {
        if (targetIds.length === 0) return new Set();

        const rows = await this.prisma.report.findMany({
            where: { userId, targetId: { in: targetIds } },
            select: { targetTypeId: true, targetId: true },
        });

        return new Set(rows.map((row) => socialTargetKey(row.targetTypeId, row.targetId)));
    }

    /**
     * Removes the caller's own report for one target. The reporter is part of
     * the delete predicate, so a report of another user can never be removed
     * through it. A user has at most one report per target, so at most one row
     * is deleted; removing a report the user does not have is a no-op.
     */
    async removeOwned(userId: string, targetTypeId: number, targetId: number): Promise<void> {
        await this.prisma.report.deleteMany({ where: { userId, targetTypeId, targetId } });
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
