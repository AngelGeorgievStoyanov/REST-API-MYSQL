import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { CLIENT_CONTROLLED_USER_FIELDS } from '../constants/admin';
import { MAX_USER_ID_LENGTH } from '../constants/auth';
import { AuthUserDto } from '../model/auth';
import { AdminPage } from '../model/admin';
import { normalizeName } from '../utils/auth';
import { ApiError } from '../utils/apiError';
import { adminPage, parseAdminPagination } from '../utils/adminPagination';
import { asRecord, rejectClientControlledFields, requireEnumValue, requireTrimmedString } from '../utils/validation';
import { toAuthUserDto } from './authService';
import { AdminUserUpdate, AuthUserRepository, AuthUserRow } from '../repositories/authUserRepository';

export class AdminUserService {
    constructor(private readonly users: AuthUserRepository) { }

    async listUsers(query: unknown): Promise<AdminPage<AuthUserDto>> {
        const pagination = parseAdminPagination(query);
        const [rows, total] = await Promise.all([
            this.users.listPage(pagination.skip, pagination.pageSize),
            this.users.countUsers(),
        ]);

        return adminPage(rows.map(toAuthUserDto), total, pagination.page, pagination.pageSize);
    }

    async updateUser(rawUserId: string, body: unknown): Promise<AuthUserDto> {
        const userId = requireTrimmedString(rawUserId, 'userId', MAX_USER_ID_LENGTH);
        const record = asRecord(body, 'Request body');
        rejectClientControlledFields(record, CLIENT_CONTROLLED_USER_FIELDS, 'Request body');

        const update: AdminUserUpdate = {};
        if (record['firstName'] !== undefined) update.firstName = normalizeName(record['firstName'], 'firstName');
        if (record['lastName'] !== undefined) update.lastName = normalizeName(record['lastName'], 'lastName');
        if (record['role'] !== undefined) update.role = requireEnumValue(record['role'], Object.values(UserRole), 'role');
        if (record['status'] !== undefined) update.status = requireEnumValue(record['status'], Object.values(UserStatus), 'status');

        if (Object.keys(update).length === 0) {
            throw ApiError.validation('Provide at least one of "firstName", "lastName", "role", "status".');
        }

        await this.requireUser(userId);

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

    private async requireUser(userId: string): Promise<AuthUserRow> {
        const user = await this.users.findById(userId);
        if (!user) throw ApiError.notFound('User not found.');

        return user;
    }
}
