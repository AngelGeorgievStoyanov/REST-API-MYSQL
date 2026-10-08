import { SOCIAL_TARGET_TYPE } from '../constants/social';

/** `target_types.name` of a resource that can carry social state. */
export type SocialTargetType = (typeof SOCIAL_TARGET_TYPE)[keyof typeof SOCIAL_TARGET_TYPE];

export interface SocialCommentsState {
    count: number;
}

/**
 * Aggregated social state of one resource. Favorites are attached to trip groups
 * only, so they are absent on days, points and images; `reportedByMe` reflects
 * the authenticated actor's report for the target and is `false` for anonymous
 * callers.
 */
export interface SocialState {
    likes: number;
    likedByMe: boolean;
    comments: SocialCommentsState;
    favorites?: number;
    favoritedByMe?: boolean;
    reportedByMe: boolean;
}

/** Pointer to one polymorphic target; `targetId` points at the resource of that type. */
export interface SocialTargetRef {
    targetType: SocialTargetType;
    targetId: number;
}

/** Social state lookup of one request, produced by the social state service. */
export interface SocialStates {
    get(targetType: SocialTargetType, targetId: number): SocialState;
}

/** Target together with the trip group it belongs to and that group's owner. */
export interface SocialTargetContext extends SocialTargetRef {
    tripGroupId: number | null;
    tripGroupOwnerId: string | null;
}
