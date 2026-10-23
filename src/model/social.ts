import { type SOCIAL_TARGET_TYPE } from '../constants/social';

/** `target_types.name` of a resource that can carry social state. */
export type SocialTargetType = (typeof SOCIAL_TARGET_TYPE)[keyof typeof SOCIAL_TARGET_TYPE];

export interface SocialCommentsState {
    count: number;
}

export interface SocialState {
    likes: number;
    likedByMe: boolean;
    comments: SocialCommentsState;
    favorites?: number;
    favoritedByMe?: boolean;
    reportedByMe: boolean;
}

export interface SocialTargetRef {
    targetType: SocialTargetType;
    targetId: number;
}

export type ReportTargetType = SocialTargetType;

export type ReportTargetRef = SocialTargetRef;

/** Social state lookup of one request, produced by the social state service. */
export interface SocialStates {
    get(targetType: SocialTargetType, targetId: number): SocialState;
}

/** Target together with the trip group it belongs to and that group's owner. */
export interface SocialTargetContext extends SocialTargetRef {
    tripGroupId: number | null;
    tripGroupOwnerId: string | null;
}

export type AnySocialTargetRef = SocialTargetRef;
