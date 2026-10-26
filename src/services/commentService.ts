import { COMMENT_TARGET_TYPE, SOCIAL_TARGET_TYPE } from '../constants/social';
import { MODERATOR_ROLES } from '../constants/trip';
import { type CommentDto, type CommentListResponse, type CommentRecord } from '../model/comment';
import { type SocialTargetRef, type SocialTargetType } from '../model/social';
import { type TripActor } from '../model/trip';
import { ApiError } from '../utils/apiError';
import { parseCommentCreateBody, parseCommentPageQuery, parseCommentUpdateBody } from '../utils/social';
import { parsePositiveId } from '../utils/validation';
import { type CommentRepository } from '../repositories/commentRepository';
import { toCommentDto } from '../mappers/commentMapper';
import { type SocialTargetRepository } from '../repositories/socialTargetRepository';
import { type TargetTypeRepository } from '../repositories/targetTypeRepository';
import { type SocialStateService } from './socialStateService';
import { checkSocialPermission } from '../utils/socialPermissions';


export class CommentService {
    constructor(
        private readonly repository: CommentRepository,
        private readonly targets: SocialTargetRepository,
        private readonly targetTypes: TargetTypeRepository,
        private readonly socialStates: SocialStateService,
    ) { }

    async listForTarget(targetType: SocialTargetType, rawId: string, query: unknown, actor: TripActor | null): Promise<CommentListResponse> {
        const target = await this.resolveTarget(targetType, rawId);
        const page = parseCommentPageQuery(query);
        const typeId = await this.targetTypes.requireId(target.targetType);

        const [rows, total] = await Promise.all([
            this.repository.listPage(typeId, target.targetId, (page.page - 1) * page.limit, page.limit),
            this.repository.countByTarget(typeId, target.targetId),
        ]);

        const states = await this.socialStates.statesFor(actor?.id ?? null, rows.map((row) => ({ targetType: COMMENT_TARGET_TYPE, targetId: row.id })));
        return { items: rows.map((row) => {
            const state = states.get(COMMENT_TARGET_TYPE, row.id);
            return toCommentDto(row, actor, state.reportedByMe, state);
        }), page: page.page, limit: page.limit, total };
    }

    /** The day must belong to the trip group from the URL; the day resource is a `trips` row. */
    async listForDay(rawTripGroupId: string, rawTripId: string, query: unknown, actor: TripActor | null): Promise<CommentListResponse> {
        const tripId = await this.resolveDay(rawTripGroupId, rawTripId);

        return this.listForTarget(SOCIAL_TARGET_TYPE.DAY, String(tripId), query, actor);
    }

    async create(
        actor: TripActor,
        targetType: SocialTargetType,
        rawId: string,
        body: unknown,
    ): Promise<CommentDto> {
        const target = await this.resolveTarget(targetType, rawId);
        checkSocialPermission(actor, 'comment', target.targetType, 'create');
        const request = parseCommentCreateBody(body);

        const [typeId, nameAuthor] = await Promise.all([
            this.targetTypes.requireId(target.targetType),
            this.repository.findAuthorName(actor.id),
        ]);

        const row = await this.repository.create({
            targetTypeId: typeId,
            targetId: target.targetId,
            ownerId: actor.id,
            nameAuthor,
            comment: request.comment,
        });

        // A comment that was just created carries no report from its author yet,
        // so the report state handed to the shared mapper is empty.
        const state = await this.socialStates.stateFor(actor.id, { targetType: COMMENT_TARGET_TYPE, targetId: row.id });
        return toCommentDto(row, actor, state.reportedByMe, state);
    }

    async createForDay(
        actor: TripActor,
        rawTripGroupId: string,
        rawTripId: string,
        body: unknown,
    ): Promise<CommentDto> {
        const tripId = await this.resolveDay(rawTripGroupId, rawTripId);

        return this.create(actor, SOCIAL_TARGET_TYPE.DAY, String(tripId), body);
    }

    /** Only the author or a moderator may edit a comment; deleting is a moderation action. */
    async update(actor: TripActor, rawCommentId: string, body: unknown): Promise<CommentDto> {
        const comment = await this.findComment(rawCommentId);
        const action = comment.parentCommentId === null ? 'comment' : 'replyComment';
        const context = action === 'replyComment' ? await this.replyPermissionContext(comment) : undefined;
        if (action === 'comment') await this.targetTypeForComment(comment);
        checkSocialPermission(actor, action, 'comment', 'edit', context);
        if (comment.ownerId !== actor.id && !MODERATOR_ROLES.includes(actor.role)) {
            throw ApiError.forbidden('Only the author or a moderator can edit a comment.');
        }

        const request = parseCommentUpdateBody(body);
        const row = await this.repository.update(comment.id, request.comment, (comment.countEdited ?? 0) + 1);

        const state = await this.socialStates.stateFor(actor.id, { targetType: COMMENT_TARGET_TYPE, targetId: row.id });
        return toCommentDto(row, actor, state.reportedByMe, state);
    }

    async delete(actor: TripActor, rawCommentId: string): Promise<void> {
        const comment = await this.findComment(rawCommentId);
        const action = comment.parentCommentId === null ? 'comment' : 'replyComment';
        const context = action === 'replyComment' ? await this.replyPermissionContext(comment) : undefined;
        if (action === 'comment') await this.targetTypeForComment(comment);
        checkSocialPermission(actor, action, 'comment', 'delete', context);
        this.assertCanDelete(actor, comment);

        await this.repository.delete(comment.id);
    }

    async listReplies(rawCommentId: string, query: unknown, actor: TripActor | null): Promise<CommentListResponse> {
        const parent = await this.findComment(rawCommentId);
        if (parent.parentCommentId !== null) throw ApiError.notFound('Comment not found.');
        const page = parseCommentPageQuery(query);
        const [rows, total] = await Promise.all([this.repository.listReplies(parent.id, (page.page - 1) * page.limit, page.limit), this.repository.countReplies(parent.id)]);
        const states = await this.socialStates.statesFor(actor?.id ?? null, rows.map((row) => ({ targetType: COMMENT_TARGET_TYPE, targetId: row.id })));
        return { items: rows.map((row) => {
            const state = states.get(COMMENT_TARGET_TYPE, row.id);
            return toCommentDto(row, actor, state.reportedByMe, state);
        }), page: page.page, limit: page.limit, total };
    }

    async createReply(actor: TripActor, rawCommentId: string, body: unknown): Promise<CommentDto> {
        const parent = await this.findComment(rawCommentId);
        if (parent.parentCommentId !== null) throw ApiError.notFound('Comment not found.');
        const parentTargetType = await this.targetTypeForComment(parent);
        checkSocialPermission(actor, 'replyComment', 'comment', 'create', { parentTargetType });
        const request = parseCommentCreateBody(body);
        const nameAuthor = await this.repository.findAuthorName(actor.id);
        const row = await this.repository.create({ targetTypeId: parent.targetTypeId, targetId: parent.targetId, parentCommentId: parent.id, ownerId: actor.id, nameAuthor, comment: request.comment });
        const state = await this.socialStates.stateFor(actor.id, { targetType: COMMENT_TARGET_TYPE, targetId: row.id });
        return toCommentDto(row, actor, state.reportedByMe, state);
    }

    async updateReply(actor: TripActor, rawReplyId: string, body: unknown): Promise<CommentDto> {
        const row = await this.findComment(rawReplyId);
        if (row.parentCommentId === null) throw ApiError.notFound('Reply not found.');
        return this.update(actor, rawReplyId, body);
    }

    async deleteReply(actor: TripActor, rawReplyId: string): Promise<void> {
        const row = await this.findComment(rawReplyId);
        if (row.parentCommentId === null) throw ApiError.notFound('Reply not found.');
        return this.delete(actor, rawReplyId);
    }

    private async findComment(rawCommentId: string): Promise<CommentRecord> {
        const comment = await this.repository.findById(parsePositiveId(rawCommentId, 'Comment id'));
        if (!comment) throw ApiError.notFound('Comment not found.');

        return comment;
    }

    private async resolveTarget(targetType: SocialTargetType, rawId: string): Promise<SocialTargetRef> {
        const target: SocialTargetRef = {
            targetType,
            targetId: parsePositiveId(rawId, 'Target id'),
        };
        await this.targets.requireContext(target);

        return target;
    }

    private async resolveDay(rawTripGroupId: string, rawTripId: string): Promise<number> {
        const tripGroupId = parsePositiveId(rawTripGroupId, 'Trip group id');
        const context = await this.targets.findContext({
            targetType: SOCIAL_TARGET_TYPE.DAY,
            targetId: parsePositiveId(rawTripId, 'Trip id'),
        });
        if (context?.tripGroupId !== tripGroupId) throw ApiError.notFound('Day not found.');

        return context.targetId;
    }

    private async replyPermissionContext(reply: CommentRecord): Promise<{ parentTargetType: SocialTargetType }> {
        if (reply.parentCommentId === null) throw ApiError.notFound('Reply not found.');
        const parent = await this.findComment(String(reply.parentCommentId));
        if (parent.parentCommentId !== null || parent.targetTypeId !== reply.targetTypeId || parent.targetId !== reply.targetId) {
            throw ApiError.notFound('Reply not found.');
        }
        return { parentTargetType: await this.targetTypeForComment(parent) };
    }

    private async targetTypeForComment(comment: CommentRecord): Promise<SocialTargetType> {
        const targetType = (await this.targetTypes.loadNames()).get(comment.targetTypeId);
        if (!targetType || targetType === SOCIAL_TARGET_TYPE.COMMENT) {
            throw ApiError.notFound('Comment not found.');
        }
        await this.targets.requireContext({ targetType, targetId: comment.targetId });
        return targetType;
    }

    /**
     * The author or a moderator may delete a comment. The trip-group owner has no
     * special deletion right beyond being the author or a moderator.
     */
    private assertCanDelete(actor: TripActor, comment: CommentRecord): void {
        if (comment.ownerId === actor.id) return;
        if (MODERATOR_ROLES.includes(actor.role)) return;

        throw ApiError.forbidden('Only the author or a moderator can delete a comment.');
    }
}
