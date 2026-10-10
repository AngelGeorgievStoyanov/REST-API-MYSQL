import { type SocialState } from '../model/social';
import { type TripActor } from '../model/trip';
import { parseSocialTargetBody, parseSocialTargetQuery } from '../utils/social';
import { type LikeRepository } from '../repositories/likeRepository';
import { type SocialStateService } from './socialStateService';
import { type SocialTargetRepository } from '../repositories/socialTargetRepository';
import { type TargetTypeRepository } from '../repositories/targetTypeRepository';

export class LikeService {
    constructor(
        private readonly repository: LikeRepository,
        private readonly targets: SocialTargetRepository,
        private readonly targetTypes: TargetTypeRepository,
        private readonly states: SocialStateService,
    ) { }

    /** Repeating a like is a no-op, so the operation is safe to retry. */
    async add(actor: TripActor, body: unknown): Promise<SocialState> {
        const target = parseSocialTargetBody(body);
        await this.targets.requireContext(target);
        const typeId = await this.targetTypes.requireId(target.targetType);

        await this.repository.add(actor.id, typeId, target.targetId);

        return this.states.stateFor(actor.id, target);
    }

    /** Deleting a like the user does not have is a no-op as well. */
    async remove(actor: TripActor, query: unknown): Promise<void> {
        const target = parseSocialTargetQuery(query);
        await this.targets.requireContext(target);
        const typeId = await this.targetTypes.requireId(target.targetType);

        await this.repository.remove(actor.id, typeId, target.targetId);
    }
}
