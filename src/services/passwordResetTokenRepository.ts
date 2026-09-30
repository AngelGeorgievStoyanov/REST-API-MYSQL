import { PrismaClient } from '@prisma/client';

export interface PasswordResetTokenRow {
    id: number;
    userId: string;
    expiresAt: Date;
    usedAt: Date | null;
}

const tokenSelect = { id: true, userId: true, expiresAt: true, usedAt: true };

export class PasswordResetTokenRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
        await this.prisma.passwordResetToken.create({
            data: {
                userId: data.userId,
                tokenHash: data.tokenHash,
                expiresAt: data.expiresAt,
                createdAt: new Date(),
            },
            select: { id: true },
        });
    }

    async findActiveByHash(tokenHash: string): Promise<PasswordResetTokenRow | null> {
        return this.prisma.passwordResetToken.findUnique({ where: { tokenHash }, select: tokenSelect });
    }

    async markUsed(tokenId: number, usedAt: Date): Promise<void> {
        await this.prisma.passwordResetToken.update({
            where: { id: tokenId },
            data: { usedAt },
            select: { id: true },
        });
    }

    /** A new reset request retires the previous outstanding tokens of the account. */
    async invalidateOutstanding(userId: string, at: Date): Promise<number> {
        const result = await this.prisma.passwordResetToken.updateMany({
            where: { userId, usedAt: null },
            data: { usedAt: at },
        });

        return result.count;
    }
}
