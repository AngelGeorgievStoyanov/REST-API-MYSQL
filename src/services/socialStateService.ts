import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { SocialState, SocialStates, SocialTargetRef, SocialTargetType } from '../model/social';
import { socialTargetKey } from '../utils/social';
import { CommentRepository } from '../repositories/commentRepository';
import { FavoriteRepository } from '../repositories/favoriteRepository';
import { LikeRepository } from '../repositories/likeRepository';
import { TargetTypeRepository } from '../repositories/targetTypeRepository';

function unique(values: number[]): number[] {
    return [...new Set(values)];
}

export class SocialStateService {
    constructor(
        private readonly targetTypes: TargetTypeRepository,
        private readonly comments: CommentRepository,
        private readonly likes: LikeRepository,
        private readonly favorites: FavoriteRepository,
    ) { }

    /**
     * One batch per aggregate for the whole request instead of one query per
     * resource, which is what keeps the trip read model free of N+1 loading.
     */
    async statesFor(actorId: string | null, targets: SocialTargetRef[]): Promise<SocialStates> {
        const targetIds = unique(targets.map((target) => target.targetId));
        const groupIds = unique(
            targets
                .filter((target) => target.targetType === SOCIAL_TARGET_TYPE.TRIP_GROUP)
                .map((target) => target.targetId),
        );

        const [typeIds, likeCounts, commentCounts, favoriteCounts, likedKeys, favoritedGroups] = await Promise.all([
            this.targetTypes.loadIds(),
            this.likes.countByTargets(targetIds),
            this.comments.countByTargets(targetIds),
            this.favorites.countByGroups(groupIds),
            actorId ? this.likes.likedTargetKeys(actorId, targetIds) : Promise.resolve(new Set<string>()),
            actorId ? this.favorites.favoritedGroupIds(actorId, groupIds) : Promise.resolve(new Set<number>()),
        ]);

        return {
            get: (targetType: SocialTargetType, targetId: number): SocialState => {
                const typeId = typeIds.get(targetType);
                const key = typeId === undefined ? '' : socialTargetKey(typeId, targetId);

                const state: SocialState = {
                    likes: likeCounts.get(key) ?? 0,
                    likedByMe: likedKeys.has(key),
                    comments: { count: commentCounts.get(key) ?? 0 },
                };

                if (targetType === SOCIAL_TARGET_TYPE.TRIP_GROUP) {
                    state.favorites = favoriteCounts.get(targetId) ?? 0;
                    state.favoritedByMe = favoritedGroups.has(targetId);
                }
                return state;
            },
        };
    }

    async stateFor(actorId: string | null, target: SocialTargetRef): Promise<SocialState> {
        const states = await this.statesFor(actorId, [target]);
        return states.get(target.targetType, target.targetId);
    }
}
