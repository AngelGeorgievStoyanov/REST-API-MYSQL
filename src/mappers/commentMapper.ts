import { CommentDto, CommentListResponse, CommentRecord } from '../model/comment';
import { toIsoString } from '../utils/utils';

export function toCommentDto(row: CommentRecord): CommentDto {
    return {
        id: row.id,
        author: { id: row.authorId, name: row.authorName },
        text: row.text,
        editCount: row.editCount ?? 0,
        createdAt: toIsoString(row.createdAt),
        updatedAt: toIsoString(row.updatedAt),
    };
}

export function toCommentListResponse(
    rows: CommentRecord[],
    page: number,
    limit: number,
    total: number,
): CommentListResponse {
    return { items: toCommentDtoList(rows), page, limit, total };
}

export function toCommentDtoList(rows: CommentRecord[]): CommentDto[] {
    return rows.map(toCommentDto);
}