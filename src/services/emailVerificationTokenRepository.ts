import { PrismaClient } from '@prisma/client';

export interface EmailVerificationTokenRow {
    id: number;
    userId: string;
    expiresAt: Date;
    usedAt: Date | null;
}

const tokenSelect = { id: true, userId: true, expiresAt: true, usedAt: true };

export class EmailVerificationTokenRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
        await this.prisma.emailVerificationToken.create({
            data: {
                userId: data.userId,
                tokenHash: data.tokenHash,
                expiresAt: data.expiresAt,
                createdAt: new Date(),
            },
            select: { id: true },
        });
    }

    /** Lookup is by hash only: the raw token never reaches the database. */
    async findActiveByHash(tokenHash: string): Promise<EmailVerificationTokenRow | null> {
        return this.prisma.emailVerificationToken.findUnique({ where: { tokenHash }, select: tokenSelect });
    }

    async markUsed(tokenId: number, usedAt: Date): Promise<void> {
        await this.prisma.emailVerificationToken.update({
            where: { id: tokenId },
            data: { usedAt },
            select: { id: true },
        });
    }

    /** Resending retires every token that is still usable for that account. */
    async invalidateOutstanding(userId: string, at: Date): Promise<number> {
        const result = await this.prisma.emailVerificationToken.updateMany({
            where: { userId, usedAt: null },
            data: { usedAt: at },
        });

        return result.count;
    }
}
