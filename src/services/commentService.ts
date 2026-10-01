import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { CommentDto, CommentListResponse, CommentRecord } from '../model/comment';
import { SocialTargetRef, SocialTargetType } from '../model/social';
import { TripActor } from '../model/trip';
import { ApiError } from '../utils/apiError';
import { canModifyTrip } from '../utils/authorization';
import { parseCommentCreateBody, parseCommentPageQuery, parseCommentUpdateBody } from '../utils/social';
import { parsePositiveId } from '../utils/validation';
import { CommentRepository } from '../repositories/commentRepository';
import { toCommentDto, toCommentListResponse } from '../mappers/commentMapper';
import { SocialTargetRepository } from '../repositories/socialTargetRepository';
import { TargetTypeRepository } from '../repositories/targetTypeRepository';


export class CommentService {
    constructor(
        private readonly repository: CommentRepository,
        private readonly targets: SocialTargetRepository,
        private readonly targetTypes: TargetTypeRepository,
    ) { }

    async listForTarget(targetType: SocialTargetType, rawId: string, query: unknown): Promise<CommentListResponse> {
        const target = await this.resolveTarget(targetType, rawId);
        const page = parseCommentPageQuery(query);
        const typeId = await this.targetTypes.requireId(target.targetType);

        const [rows, total] = await Promise.all([
            this.repository.listPage(typeId, target.targetId, (page.page - 1) * page.limit, page.limit),
            this.repository.countByTarget(typeId, target.targetId),
        ]);

        return toCommentListResponse(rows, page.page, page.limit, total);
    }

    /** The day must belong to the trip from the URL; the day resource is a `trips` row. */
    async listForDay(rawTripId: string, rawDayId: string, query: unknown): Promise<CommentListResponse> {
        const dayId = await this.resolveDay(rawTripId, rawDayId);

        return this.listForTarget(SOCIAL_TARGET_TYPE.DAY, String(dayId), query);
    }

    async create(
        actor: TripActor,
        targetType: SocialTargetType,
        rawId: string,
        body: unknown,
    ): Promise<CommentDto> {
        const target = await this.resolveTarget(targetType, rawId);
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
            text: request.text,
        });

        return toCommentDto(row);
    }

    async createForDay(
        actor: TripActor,
        rawTripId: string,
        rawDayId: string,
        body: unknown,
    ): Promise<CommentDto> {
        const dayId = await this.resolveDay(rawTripId, rawDayId);

        return this.create(actor, SOCIAL_TARGET_TYPE.DAY, String(dayId), body);
    }

    /** Only the author rewrites a comment; deleting is a moderation action. */
    async update(actor: TripActor, rawCommentId: string, body: unknown): Promise<CommentDto> {
        const comment = await this.findComment(rawCommentId);
        if (comment.authorId !== actor.id) {
            throw ApiError.forbidden('Only the author can edit a comment.');
        }

        const request = parseCommentUpdateBody(body);
        const row = await this.repository.update(comment.id, request.text, (comment.editCount ?? 0) + 1);

        return toCommentDto(row);
    }

    async delete(actor: TripActor, rawCommentId: string): Promise<void> {
        const comment = await this.findComment(rawCommentId);
        await this.assertCanDelete(actor, comment);

        await this.repository.delete(comment.id);
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

    private async resolveDay(rawTripId: string, rawDayId: string): Promise<number> {
        const tripId = parsePositiveId(rawTripId, 'Trip id');
        const context = await this.targets.findContext({
            targetType: SOCIAL_TARGET_TYPE.DAY,
            targetId: parsePositiveId(rawDayId, 'Day id'),
        });
        if (!context || context.tripGroupId !== tripId) throw ApiError.notFound('Day not found.');

        return context.targetId;
    }

    /**
     * The author, the owner of the trip group the target belongs to, or a moderator
     * may delete a comment — the polymorphic target carries the ownership context.
     */
    private async assertCanDelete(actor: TripActor, comment: CommentRecord): Promise<void> {
        if (comment.authorId === actor.id) return;

        const names = await this.targetTypes.loadNames();
        const targetType = names.get(comment.targetTypeId);
        if (!targetType) throw ApiError.internal('The target type of this comment is unknown.');

        const context = await this.targets.requireContext({ targetType, targetId: comment.targetId });
        if (!canModifyTrip(actor, context.tripGroupOwnerId)) {
            throw ApiError.forbidden('Only the author, the trip owner or a moderator can delete this comment.');
        }
    }
}
