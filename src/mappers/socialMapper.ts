import { type SocialState, type SocialTargetType } from '../model/social';

export function toSocialState(input: {
    targetType: SocialTargetType;
    likes: number;
    likedByMe: boolean;
    commentCount: number;
    favorites?: number;
    favoritedByMe?: boolean;
    reportedByMe: boolean;
}): SocialState {
    const state: SocialState = {
        likes: input.likes,
        likedByMe: input.likedByMe,
        comments: { count: input.commentCount },
        reportedByMe: input.reportedByMe,
    };

    state.favorites = input.favorites ?? 0;
    state.favoritedByMe = input.favoritedByMe ?? false;
    return state;
}
