import { MODERATOR_ROLES } from '../constants/trip';
import { TripActor } from '../model/trip';

/** Trips, their days and their points may only be changed by the owner or a moderator. */
export function canModifyTrip(actor: TripActor, ownerId: string | null): boolean {
    if (ownerId === null) return false;

    return ownerId === actor.id || MODERATOR_ROLES.includes(actor.role);
}
