import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { CLIENT_CONTROLLED_USER_FIELDS } from '../constants/admin';
import { MAX_USER_ID_LENGTH } from '../constants/auth';
import { type AuthUserDto, type AuthUserRecord } from '../model/auth';
import { type AdminPage } from '../model/admin';
import { type TripActor } from '../model/trip';
import { normalizeEmail, normalizeName, hashPassword } from '../utils/auth';
import { ApiError } from '../utils/apiError';
import { asRecord, rejectClientControlledFields, requireEnumValue, requireTrimmedString } from '../utils/validation';
import { toAuthUserDto, toAuthUserDtoList } from '../mappers/userMapper';
import { toAdminPageDto } from '../mappers/adminMapper';
import { parseAdminPagination } from '../utils/adminPagination';
import { type AdminUserUpdate, type AuthUserRepository } from '../repositories/authUserRepository';

export class AdminUserService {
    constructor(private readonly users: AuthUserRepository) { }

    async listUsers(query: unknown): Promise<AdminPage<AuthUserDto>> {
        const pagination = parseAdminPagination(query);
        const [rows, total] = await Promise.all([
            this.users.listPage(pagination.skip, pagination.pageSize),
            this.users.countUsers(),
        ]);

        return toAdminPageDto(toAuthUserDtoList(rows), total, pagination.page, pagination.pageSize);
    }

    async updateUser(actor: TripActor, rawUserId: string, body: unknown): Promise<AuthUserDto> {
        const userId = requireTrimmedString(rawUserId, 'userId', MAX_USER_ID_LENGTH);
        const record = asRecord(body, 'Request body');
        rejectClientControlledFields(record, CLIENT_CONTROLLED_USER_FIELDS, 'Request body');

        const isAdmin = actor.role === 'admin';
        const update: AdminUserUpdate = {};

        if (record['firstName'] !== undefined) update.firstName = normalizeName(record['firstName'], 'firstName');
        if (record['lastName'] !== undefined) update.lastName = normalizeName(record['lastName'], 'lastName');
        if (record['email'] !== undefined) update.email = normalizeEmail(record['email']);
        if (record['status'] !== undefined) update.status = requireEnumValue(record['status'], Object.values(UserStatus), 'status');
        if (record['emailVerified'] !== undefined) update.emailVerifiedAt = record['emailVerified'] === true ? new Date() : null;

        if (isAdmin) {
            if (record['role'] !== undefined) update.role = requireEnumValue(record['role'], Object.values(UserRole), 'role');
            if (record['password'] !== undefined) update.hashedPassword = await hashPassword(record['password'] as string);
        } else if (record['role'] !== undefined || record['password'] !== undefined) {
            throw ApiError.forbidden('Only an admin can change role or password.');
        }

        if (Object.keys(update).length === 0) {
            throw ApiError.validation('Provide at least one of firstName, lastName, email, role, status, emailVerified, or password.');
        }

        const existing = await this.requireUser(userId);
        if (update.email && existing.email !== update.email) {
            const collision = await this.users.findByEmail(update.email);
            if (collision) throw ApiError.conflict('Another account already uses this email address.');
        }

        return toAuthUserDto(await this.users.updateAdmin(userId, update));
    }

    /** The database refuses the delete while the account still owns content. */
    async deleteUser(rawUserId: string): Promise<void> {
        const userId = requireTrimmedString(rawUserId, 'userId', MAX_USER_ID_LENGTH);
        await this.requireUser(userId);

        try {
            await this.users.remove(userId);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
                throw ApiError.conflict('The account still owns trips, days, points or comments.');
            }
            throw error;
        }
    }

    private async requireUser(userId: string): Promise<AuthUserRecord> {
        const user = await this.users.findById(userId);
        if (!user) throw ApiError.notFound('User not found.');

        return user;
    }
}
