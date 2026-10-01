import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { SocialState, SocialTargetType } from '../model/social';

export function toSocialState(input: {
    targetType: SocialTargetType;
    likes: number;
    likedByMe: boolean;
    commentCount: number;
    favorites?: number;
    favoritedByMe?: boolean;
}): SocialState {
    const state: SocialState = {
        likes: input.likes,
        likedByMe: input.likedByMe,
        comments: { count: input.commentCount },
    };

    if (input.targetType === SOCIAL_TARGET_TYPE.TRIP_GROUP) {
        state.favorites = input.favorites ?? 0;
        state.favoritedByMe = input.favoritedByMe ?? false;
    }
    return state;
}