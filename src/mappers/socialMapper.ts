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
  return {
    likes: input.likes,
    likedByMe: input.likedByMe,
    comments: { count: input.commentCount },
    favorites: input.favorites ?? 0,
    favoritedByMe: input.favoritedByMe ?? false,
    reportedByMe: input.reportedByMe,
  };
}
