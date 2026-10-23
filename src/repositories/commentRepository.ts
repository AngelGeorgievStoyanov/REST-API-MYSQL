import { type Prisma, type PrismaClient } from '@prisma/client';
import { COMMENT_TARGET_TYPE, MAX_COMMENT_AUTHOR_LENGTH } from '../constants/social';
import { type CommentRecord } from '../model/comment';
import { ApiError } from '../utils/apiError';
import { socialTargetKey } from '../utils/social';
import { deleteSocialRecordsForTargets, socialCleanupTargets } from './polymorphicTargets';


const commentSelect = {
    id: true,
    nameAuthor: true,
    comment: true,
    ownerId: true,
    countEdited: true,
    targetTypeId: true,
    targetId: true,
    parentCommentId: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

function toCommentRecord(row: CommentRow): CommentRecord {
    return {
        id: row.id,
        ownerId: row.ownerId,
        nameAuthor: row.nameAuthor,
        comment: row.comment,
        countEdited: row.countEdited,
        targetTypeId: row.targetTypeId,
        targetId: row.targetId,
        parentCommentId: row.parentCommentId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export class CommentRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** Newest first; `id` breaks ties because the live `createdAt` is nullable. */
    async listPage(targetTypeId: number, targetId: number, skip: number, take: number): Promise<CommentRecord[]> {
        const rows = await this.prisma.comment.findMany({
            where: { targetTypeId, targetId, parentCommentId: null },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take,
            select: commentSelect,
        });
        return rows.map(toCommentRecord);
    }

    async countByTarget(targetTypeId: number, targetId: number): Promise<number> {
        return this.prisma.comment.count({ where: { targetTypeId, targetId, parentCommentId: null } });
    }

    /** Batch comment counts of many targets, keyed by `targetTypeId:targetId`. */
    async countByTargets(targetIds: number[]): Promise<Map<string, number>> {
        if (targetIds.length === 0) return new Map();

        const rows = await this.prisma.comment.groupBy({
            by: ['targetTypeId', 'targetId'],
            where: { targetId: { in: targetIds }, parentCommentId: null },
            _count: { _all: true },
        });

        return new Map(rows.map((row) => [socialTargetKey(row.targetTypeId, row.targetId), row._count._all]));
    }

    async findById(commentId: number): Promise<CommentRecord | null> {
        const row = await this.prisma.comment.findUnique({ where: { id: commentId }, select: commentSelect });
        return row ? toCommentRecord(row) : null;
    }

    async create(data: {
        targetTypeId: number;
        targetId: number;
        ownerId: string;
        nameAuthor: string;
        comment: string;
        parentCommentId?: number | null;
    }): Promise<CommentRecord> {
        const row = await this.prisma.comment.create({
            data: {
                targetTypeId: data.targetTypeId,
                targetId: data.targetId,
                parentCommentId: data.parentCommentId ?? null,
                ownerId: data.ownerId,
                nameAuthor: data.nameAuthor,
                comment: data.comment,
                createdAt: new Date(),
            },
            select: commentSelect,
        });
        return toCommentRecord(row);
    }

    async update(commentId: number, comment: string, countEdited: number): Promise<CommentRecord> {
        const row = await this.prisma.comment.update({
            where: { id: commentId },
            data: { comment, countEdited },
            select: commentSelect,
        });
        return toCommentRecord(row);
    }

    async delete(commentId: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            // A comment is itself a report target, so the central cleanup removes
            // the reports pointing at it together with the row.
            const replies = await tx.comment.findMany({ where: { parentCommentId: commentId }, select: { id: true } });
            const ids = [commentId, ...replies.map((reply) => reply.id)];
            await deleteSocialRecordsForTargets(tx, socialCleanupTargets(COMMENT_TARGET_TYPE, ids));
            if (replies.length > 0) await tx.comment.deleteMany({ where: { id: { in: replies.map((reply) => reply.id) } } });

            await tx.comment.delete({ where: { id: commentId } });
        });
    }

    async listReplies(parentCommentId: number, skip: number, take: number): Promise<CommentRecord[]> {
        const rows = await this.prisma.comment.findMany({ where: { parentCommentId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take, select: commentSelect });
        return rows.map(toCommentRecord);
    }

    async countReplies(parentCommentId: number): Promise<number> {
        return this.prisma.comment.count({ where: { parentCommentId } });
    }

    async countRepliesByParents(parentIds: number[]): Promise<Map<number, number>> {
        if (parentIds.length === 0) return new Map();
        const rows = await this.prisma.comment.groupBy({ by: ['parentCommentId'], where: { parentCommentId: { in: parentIds } }, _count: { _all: true } });
        return new Map(rows.flatMap((row) => row.parentCommentId === null ? [] : [[row.parentCommentId, row._count._all] as const]));
    }

    /** `comments.nameAuthor` is a NOT NULL snapshot of the author's name. */
    async findAuthorName(userId: string): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true },
        });
        if (!user) throw ApiError.unauthorized('The authenticated user no longer exists.');

        return `${user.firstName} ${user.lastName}`.trim().slice(0, MAX_COMMENT_AUTHOR_LENGTH);
    }
}
