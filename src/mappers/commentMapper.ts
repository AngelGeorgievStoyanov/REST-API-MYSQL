import { MODERATOR_ROLES } from '../constants/trip';
import { type CommentDto, type CommentListResponse, type CommentPermissions, type CommentRecord } from '../model/comment';
import { type TripActor } from '../model/trip';
import { type SocialState } from '../model/social';
import { toIsoString } from '../utils/utils';

/** `reportedByMe` is the viewer's report state for this comment, resolved in batch by the service. */
export function toCommentDto(row: CommentRecord, actor: TripActor | null, reportedByMe: boolean, social?: SocialState): CommentDto {
    const canModify = actor !== null && (actor.id === row.ownerId || MODERATOR_ROLES.includes(actor.role));
    const permissions: CommentPermissions = { canEdit: canModify, canDelete: canModify };

    return {
        id: row.id,
        parentCommentId: row.parentCommentId,
        author: { name: row.nameAuthor },
        comment: row.comment,
        permissions,
        social: { likes: social?.likes ?? 0, likedByMe: social?.likedByMe ?? false, comments: social?.comments ?? { count: 0 }, favorites: social?.favorites ?? 0, favoritedByMe: social?.favoritedByMe ?? false, reportedByMe: social?.reportedByMe ?? reportedByMe },
        createdAt: toIsoString(row.createdAt),
        updatedAt: toIsoString(row.updatedAt),
    };
}

export function toCommentListResponse(
    rows: CommentRecord[],
    actor: TripActor | null,
    page: number,
    limit: number,
    total: number,
    reportedCommentIds: ReadonlySet<number>,
): CommentListResponse {
    return { items: toCommentDtoList(rows, actor, reportedCommentIds), page, limit, total };
}

/** Batch mapping of one comment page against the viewer's report state. */
export function toCommentDtoList(rows: CommentRecord[], actor: TripActor | null, reportedCommentIds: ReadonlySet<number>): CommentDto[] {
    return rows.map((row) => toCommentDto(row, actor, reportedCommentIds.has(row.id)));
}
