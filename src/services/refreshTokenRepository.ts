import { PrismaClient } from '@prisma/client';

export interface RefreshTokenRow {
    id: number;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
}

const tokenSelect = { id: true, userId: true, expiresAt: true, revokedAt: true };

/**
 * Refresh sessions are opaque tokens stored as a hash. Rotation revokes the
 * presented row and issues a new one, so a revoked row means the token was
 * already spent.
 */
export class RefreshTokenRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
        await this.prisma.refreshToken.create({
            data: {
                userId: data.userId,
                tokenHash: data.tokenHash,
                expiresAt: data.expiresAt,
                createdAt: new Date(),
            },
            select: { id: true },
        });
    }

    async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
        return this.prisma.refreshToken.findUnique({ where: { tokenHash }, select: tokenSelect });
    }

    async revoke(tokenId: number, revokedAt: Date): Promise<void> {
        await this.prisma.refreshToken.update({
            where: { id: tokenId },
            data: { revokedAt },
            select: { id: true },
        });
    }

    /** Used on logout, on reuse detection and after a password reset. */
    async revokeAllForUser(userId: string, revokedAt: Date): Promise<number> {
        const result = await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt },
        });

        return result.count;
    }
}
