export interface CommentAuthor {
    /** `comments.nameAuthor` snapshot taken when the comment was written. */
    name: string;
}

export interface CommentPermissions {
    canEdit: boolean;
    canDelete: boolean;
}

/**
 * Social state of one comment. A comment is a report-only target — it is never
 * a like or favorite target — so it carries no like/favorite fields.
 */
export interface CommentSocialState {
    reportedByMe: boolean;
}

export interface CommentDto {
    id: number;
    author: CommentAuthor;
    comment: string;
    permissions: CommentPermissions;
    social: CommentSocialState;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface CommentRecord {
    id: number;
    ownerId: string;
    nameAuthor: string;
    comment: string;
    countEdited: number | null;
    targetTypeId: number;
    targetId: number;
    createdAt: Date | null;
    updatedAt: Date | null;
}

export interface CommentCreateRequest {
    comment: string;
}

export interface CommentUpdateRequest {
    comment: string;
}

/** One page of the comments of a single target. */
export interface CommentListResponse {
    items: CommentDto[];
    page: number;
    limit: number;
    total: number;
}
