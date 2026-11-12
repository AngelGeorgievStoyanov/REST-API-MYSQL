import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { CLIENT_CONTROLLED_USER_FIELDS } from '../constants/admin';
import { MAX_USER_ID_LENGTH } from '../constants/auth';
import { type AuthUserDto, type AuthUserRecord } from '../model/auth';
import { type ImageDto } from '../model/image';
import { type AdminPage } from '../model/admin';
import { type TripActor } from '../model/trip';
import { normalizeEmail, normalizeName, hashPassword } from '../utils/auth';
import { ApiError } from '../utils/apiError';
import {
  asRecord,
  rejectClientControlledFields,
  requireEnumValue,
  requireTrimmedString,
} from '../utils/validation';
import { toAuthUserDto, toAuthUserDtoList } from '../mappers/userMapper';
import { toAdminPageDto } from '../mappers/adminMapper';
import { parseAdminPagination } from '../utils/adminPagination';
import { type AdminUserUpdate, type AuthUserRepository } from '../repositories/authUserRepository';
import { type AuthService } from './authService';

export class AdminUserService {
  constructor(
    private readonly users: AuthUserRepository,
    private readonly auth: AuthService,
  ) {}

  async listUsers(actor: TripActor, query: unknown): Promise<AdminPage<AuthUserDto>> {
    const pagination = parseAdminPagination(query);
    const roleFilter = actor.role === UserRole.manager ? UserRole.user : undefined;
    const [rows, total] = await Promise.all([
      this.users.listPage(pagination.skip, pagination.pageSize, roleFilter),
      this.users.countUsers(roleFilter),
    ]);

    return toAdminPageDto(toAuthUserDtoList(rows), total, pagination.page, pagination.pageSize);
  }

  async getUserProfileImage(actor: TripActor, rawUserId: string): Promise<ImageDto | null> {
    const userId = requireTrimmedString(rawUserId, 'userId', MAX_USER_ID_LENGTH);
    const user = await this.requireUser(userId);
    this.assertManagerTargetIsUser(actor, user);

    return this.auth.getProfileImage(userId);
  }

  async setUserProfileImage(
    actor: TripActor,
    rawUserId: string,
    filePath: string,
  ): Promise<ImageDto> {
    const userId = requireTrimmedString(rawUserId, 'userId', MAX_USER_ID_LENGTH);
    const user = await this.requireUser(userId);
    this.assertManagerTargetIsUser(actor, user);

    return this.auth.setProfileImage(userId, filePath);
  }

  async removeUserProfileImage(actor: TripActor, rawUserId: string): Promise<void> {
    const userId = requireTrimmedString(rawUserId, 'userId', MAX_USER_ID_LENGTH);
    const user = await this.requireUser(userId);
    this.assertManagerTargetIsUser(actor, user);

    return this.auth.removeProfileImage(userId);
  }

  async updateUser(actor: TripActor, rawUserId: string, body: unknown): Promise<AuthUserDto> {
    const userId = requireTrimmedString(rawUserId, 'userId', MAX_USER_ID_LENGTH);
    const existing = await this.requireUser(userId);
    this.assertManagerTargetIsUser(actor, existing);

    const record = asRecord(body, 'Request body');
    rejectClientControlledFields(record, CLIENT_CONTROLLED_USER_FIELDS, 'Request body');

    const isAdmin = actor.role === UserRole.admin;
    const update: AdminUserUpdate = {};

    if (record['firstName'] !== undefined)
      update.firstName = normalizeName(record['firstName'], 'firstName');
    if (record['lastName'] !== undefined)
      update.lastName = normalizeName(record['lastName'], 'lastName');
    if (record['status'] !== undefined)
      update.status = requireEnumValue(record['status'], Object.values(UserStatus), 'status');
    if (record['emailVerified'] !== undefined)
      update.emailVerifiedAt = record['emailVerified'] === true ? new Date() : null;

    if (isAdmin) {
      if (record['email'] !== undefined) update.email = normalizeEmail(record['email']);
      if (record['role'] !== undefined)
        update.role = requireEnumValue(record['role'], Object.values(UserRole), 'role');
      if (record['password'] !== undefined)
        update.hashedPassword = await hashPassword(record['password'] as string);
    } else if (
      record['email'] !== undefined ||
      record['role'] !== undefined ||
      record['password'] !== undefined
    ) {
      throw ApiError.forbidden('Only an admin can change email, role or password.');
    }

    if (Object.keys(update).length === 0) {
      throw ApiError.validation(
        'Provide at least one of firstName, lastName, email, role, status, emailVerified, or password.',
      );
    }

    if (update.email && existing.email !== update.email) {
      const collision = await this.users.findByEmail(update.email);
      if (collision) throw ApiError.conflict('Another account already uses this email address.');
    }

    return toAuthUserDto(await this.users.updateAdmin(userId, update));
  }

  /** The database refuses the delete while the account still owns content. */
  async deleteUser(actor: TripActor, rawUserId: string): Promise<void> {
    const userId = requireTrimmedString(rawUserId, 'userId', MAX_USER_ID_LENGTH);
    const existing = await this.requireUser(userId);
    this.assertManagerTargetIsUser(actor, existing);

    try {
      await this.users.remove(userId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw ApiError.conflict('The account still owns trips, days, points or comments.');
      }
      throw error;
    }
  }

  private assertManagerTargetIsUser(actor: TripActor, target: AuthUserRecord): void {
    if (actor.role === UserRole.manager && target.role !== UserRole.user) {
      throw ApiError.forbidden('Managers can only manage users with the user role.');
    }
  }

  private async requireUser(userId: string): Promise<AuthUserRecord> {
    const user = await this.users.findById(userId);
    if (!user) throw ApiError.notFound('User not found.');

    return user;
  }
}
