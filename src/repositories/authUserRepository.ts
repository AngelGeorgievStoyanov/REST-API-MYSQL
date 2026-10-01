import { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { AuthUserRecord } from '../model/auth';


/** Fields an administrator may change on another account. */
export interface AdminUserUpdate {
    firstName?: string;
    lastName?: string;
    role?: UserRole;
    status?: UserStatus;
}

/** Fields the owner of an account may change on their own profile. */
export interface ProfileUpdate {
    firstName: string;
    lastName: string;
}

const authUserSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    hashedPassword: true,
    role: true,
    status: true,
    emailVerifiedAt: true,
} satisfies Prisma.UserSelect;

export class AuthUserRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async findByEmail(email: string): Promise<AuthUserRecord | null> {
        return this.prisma.user.findUnique({ where: { email }, select: authUserSelect });
    }

    async findById(userId: string): Promise<AuthUserRecord | null> {
        return this.prisma.user.findUnique({ where: { id: userId }, select: authUserSelect });
    }

    /** New accounts start unverified; nothing else is client-controlled. */
    async create(data: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        hashedPassword: string;
    }): Promise<AuthUserRecord> {
        return this.prisma.user.create({
            data: {
                id: data.id,
                email: data.email,
                firstName: data.firstName,
                lastName: data.lastName,
                hashedPassword: data.hashedPassword,
                status: UserStatus.PENDING_VERIFICATION,
                verifyEmail: 0,
                createdAt: new Date(),
            },
            select: authUserSelect,
        });
    }

    /**
     * `verifyEmail` is kept in sync for the legacy `/users` layer that still reads
     * it; `emailVerifiedAt` is the authoritative field of the new flow. Only an
     * unverified account is promoted to ACTIVE: a suspended/deactivated account
     * stays in its state and is refused by the service.
     */
    async markEmailVerified(userId: string, verifiedAt: Date): Promise<AuthUserRecord> {
        await this.prisma.user.updateMany({
            where: { id: userId, status: UserStatus.PENDING_VERIFICATION },
            data: { status: UserStatus.ACTIVE },
        });

        return this.prisma.user.update({
            where: { id: userId },
            data: { emailVerifiedAt: verifiedAt, verifyEmail: 1 },
            select: authUserSelect,
        });
    }

    async updatePassword(userId: string, hashedPassword: string): Promise<AuthUserRecord> {
        return this.prisma.user.update({
            where: { id: userId },
            data: { hashedPassword },
            select: authUserSelect,
        });
    }

    async touchLogin(userId: string, at: Date): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { lastTimeLogin: at.toISOString() },
            select: { id: true },
        });
    }

    /** Administrative account page, ordered by email for a stable answer. */
    async listPage(skip: number, take: number): Promise<AuthUserRecord[]> {
        return this.prisma.user.findMany({
            orderBy: [{ email: 'asc' }, { id: 'asc' }],
            skip,
            take,
            select: authUserSelect,
        });
    }

    async countUsers(): Promise<number> {
        return this.prisma.user.count();
    }

    async updateAdmin(userId: string, data: AdminUserUpdate): Promise<AuthUserRecord> {
        return this.prisma.user.update({ where: { id: userId }, data, select: authUserSelect });
    }

    async updateProfile(userId: string, data: ProfileUpdate): Promise<AuthUserRecord> {
        return this.prisma.user.update({ where: { id: userId }, data, select: authUserSelect });
    }

    async remove(userId: string): Promise<void> {
        await this.prisma.user.delete({ where: { id: userId }, select: { id: true } });
    }
}
