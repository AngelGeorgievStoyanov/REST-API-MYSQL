import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { type SocialState } from '../model/social';
import { type TripActor, type TripGroupResponse } from '../model/trip';
import { parseSocialTargetBody, parseSocialTargetQuery, parseTripGroupId } from '../utils/social';
import { checkSocialPermission } from '../utils/socialPermissions';
import { type FavoriteRepository } from '../repositories/favoriteRepository';
import { type TripRepository } from '../repositories/tripRepository';
import { type SocialStateService } from './socialStateService';
import { type SocialTargetRepository } from '../repositories/socialTargetRepository';
import { type TargetTypeRepository } from '../repositories/targetTypeRepository';
import { toGroupResponses } from './tripService';

export class FavoriteService {
    constructor(
        private readonly repository: FavoriteRepository,
        private readonly targets: SocialTargetRepository,
        private readonly states: SocialStateService,
        private readonly trips: TripRepository,
        private readonly targetTypes: TargetTypeRepository,
    ) { }

    async add(actor: TripActor, body: unknown): Promise<SocialState> {
        const target = this.favoriteBodyTarget(body);
        await this.targets.requireContext(target);
        checkSocialPermission(actor, 'favorite', target.targetType, 'create');
        const typeId = await this.targetTypes.requireId(target.targetType);
        await this.repository.add(actor.id, typeId, target.targetId);
        return this.states.stateFor(actor.id, target);
    }

    async remove(actor: TripActor, query: unknown): Promise<void> {
        const target = this.favoriteQueryTarget(query);
        await this.targets.requireContext(target);
        checkSocialPermission(actor, 'favorite', target.targetType, 'delete');
        const typeId = await this.targetTypes.requireId(target.targetType);
        await this.repository.remove(actor.id, typeId, target.targetId);
    }

    /**
     * `GET /me/favorites`: trip groups the authenticated actor actually has a
     * persisted favorite record for, most recently favorited first. The user id
     * comes exclusively from the request context; an empty favorite set is the
     * contract-defined empty collection, never "all trips".
     *
     * Returns the canonical TripGroupResponse shape — the same structure as
     * GET /trips, GET /trips/top, GET /trips/:id.
     */
    async listFavorites(actor: TripActor): Promise<TripGroupResponse[]> {
        const groupIds = await this.repository.listFavoriteGroupIds(actor.id);
        if (groupIds.length === 0) return [];

        const rows = await this.trips.findGroupsByIdsWithDetails(groupIds);
        return toGroupResponses(rows, this.states, actor);
    }

    private favoriteBodyTarget(body: unknown) {
        if (typeof body === 'object' && body !== null && 'tripGroupId' in body) {
            return { targetType: SOCIAL_TARGET_TYPE.TRIP_GROUP, targetId: parseTripGroupId(body) };
        }
        return parseSocialTargetBody(body);
    }

    private favoriteQueryTarget(query: unknown) {
        if (typeof query === 'object' && query !== null && 'tripGroupId' in query) {
            return { targetType: SOCIAL_TARGET_TYPE.TRIP_GROUP, targetId: parseTripGroupId(query) };
        }
        return parseSocialTargetQuery(query);
    }
}
