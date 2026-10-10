import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { type SocialState } from '../model/social';
import { type TripActor, type TripGroupResponse } from '../model/trip';
import { parseTripGroupId } from '../utils/social';
import { type FavoriteRepository } from '../repositories/favoriteRepository';
import { type TripRepository } from '../repositories/tripRepository';
import { type SocialStateService } from './socialStateService';
import { type SocialTargetRepository } from '../repositories/socialTargetRepository';
import { toGroupResponses } from './tripService';

export class FavoriteService {
    constructor(
        private readonly repository: FavoriteRepository,
        private readonly targets: SocialTargetRepository,
        private readonly states: SocialStateService,
        private readonly trips: TripRepository,
    ) { }

    /** Favorites exist on trip groups only; the answer is the group's social state. */
    async add(actor: TripActor, body: unknown): Promise<SocialState> {
        const tripGroupId = await this.resolveTripGroup(parseTripGroupId(body));

        await this.repository.add(actor.id, tripGroupId);

        return this.states.stateFor(actor.id, {
            targetType: SOCIAL_TARGET_TYPE.TRIP_GROUP,
            targetId: tripGroupId,
        });
    }

    async remove(actor: TripActor, query: unknown): Promise<void> {
        const tripGroupId = await this.resolveTripGroup(parseTripGroupId(query));

        await this.repository.remove(actor.id, tripGroupId);
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

    private async resolveTripGroup(tripGroupId: number): Promise<number> {
        await this.targets.requireContext({
            targetType: SOCIAL_TARGET_TYPE.TRIP_GROUP,
            targetId: tripGroupId,
        });

        return tripGroupId;
    }
}
