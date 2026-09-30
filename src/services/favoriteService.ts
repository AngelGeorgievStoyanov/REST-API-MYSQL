import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { SocialState } from '../model/social';
import { TripActor } from '../model/trip';
import { parseTripGroupId } from '../utils/social';
import { FavoriteRepository } from '../repositories/favoriteRepository';
import { SocialStateService } from './socialStateService';
import { SocialTargetRepository } from '../repositories/socialTargetRepository';

export class FavoriteService {
    constructor(
        private readonly repository: FavoriteRepository,
        private readonly targets: SocialTargetRepository,
        private readonly states: SocialStateService,
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

    private async resolveTripGroup(tripGroupId: number): Promise<number> {
        await this.targets.requireContext({
            targetType: SOCIAL_TARGET_TYPE.TRIP_GROUP,
            targetId: tripGroupId,
        });

        return tripGroupId;
    }
}
