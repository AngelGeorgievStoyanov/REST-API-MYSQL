export interface CommentAuthor {
    id: string;
    /** `comments.nameAuthor` snapshot taken when the comment was written. */
    name: string;
}

export interface CommentDto {
    id: number;
    author: CommentAuthor;
    text: string;
    editCount: number;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface CommentCreateRequest {
    text: string;
}

export interface CommentUpdateRequest {
    text: string;
}

/** One page of the comments of a single target. */
export interface CommentListResponse {
    items: CommentDto[];
    page: number;
    limit: number;
    total: number;
}
