import { type ReportTargetType } from '../model/report';
import { type SocialState, type SocialStates, type SocialTargetRef, type SocialTargetType } from '../model/social';
import { socialTargetKey } from '../utils/social';
import { toSocialState } from '../mappers/socialMapper';
import { type CommentRepository } from '../repositories/commentRepository';
import { type FavoriteRepository } from '../repositories/favoriteRepository';
import { type LikeRepository } from '../repositories/likeRepository';
import { type ReportRepository } from '../repositories/reportRepository';
import { type TargetTypeRepository } from '../repositories/targetTypeRepository';

function unique(values: number[]): number[] {
    return [...new Set(values)];
}

export class SocialStateService {
    constructor(
        private readonly targetTypes: TargetTypeRepository,
        private readonly comments: CommentRepository,
        private readonly likes: LikeRepository,
        private readonly favorites: FavoriteRepository,
        private readonly reports: ReportRepository,
    ) { }

    /**
     * One batch per aggregate for the whole request instead of one query per
     * resource, which is what keeps the trip read model free of N+1 loading.
     */
    async statesFor(actorId: string | null, targets: SocialTargetRef[]): Promise<SocialStates> {
        const targetIds = unique(targets.map((target) => target.targetId));
        const targetRefs = targets.map((target) => ({ targetType: target.targetType, targetId: target.targetId }));

        const typeIds = await this.targetTypes.loadIds();
        const commentTargetIds = unique(targets.filter((target) => target.targetType === 'comment').map((target) => target.targetId));
        const [likeCounts, commentCounts, replyCounts, favoriteCounts, likedKeys, favoritedGroups, reportedKeys] = await Promise.all([
            this.likes.countByTargets(targetIds),
            this.comments.countByTargets(targetIds),
            this.comments.countRepliesByParents(commentTargetIds),
            this.favorites.countByTargets(typeIds, targetRefs),
            actorId ? this.likes.likedTargetKeys(actorId, targetIds) : Promise.resolve(new Set<string>()),
            actorId ? this.favorites.favoritedTargetKeys(actorId, targetRefs, typeIds) : Promise.resolve(new Set<string>()),
            actorId ? this.reports.reportedTargetKeys(actorId, targetIds) : Promise.resolve(new Set<string>()),
        ]);

        return {
            get: (targetType: SocialTargetType, targetId: number): SocialState => {
                const typeId = typeIds.get(targetType);
                const key = typeId === undefined ? '' : socialTargetKey(typeId, targetId);

                return toSocialState({
                    targetType,
                    likes: likeCounts.get(key) ?? 0,
                    likedByMe: likedKeys.has(key),
                    commentCount: targetType === 'comment' ? replyCounts.get(targetId) ?? 0 : commentCounts.get(key) ?? 0,
                    favorites: favoriteCounts.get(key) ?? 0,
                    favoritedByMe: favoritedGroups.has(key),
                    reportedByMe: reportedKeys.has(key),
                });
            },
        };
    }

    async reportedTargetIds(actorId: string | null, targetType: ReportTargetType, targetIds: number[]): Promise<Set<number>> {
        const ids = unique(targetIds);
        if (actorId === null || ids.length === 0) return new Set();

        const [typeId, reportedKeys] = await Promise.all([
            this.targetTypes.requireIdByRowName(targetType),
            this.reports.reportedTargetKeys(actorId, ids),
        ]);

        return new Set(ids.filter((targetId) => reportedKeys.has(socialTargetKey(typeId, targetId))));
    }

    async stateFor(actorId: string | null, target: SocialTargetRef): Promise<SocialState> {
        const states = await this.statesFor(actorId, [target]);
        return states.get(target.targetType, target.targetId);
    }
}
