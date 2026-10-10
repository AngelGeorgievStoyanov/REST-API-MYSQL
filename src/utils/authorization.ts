import { MODERATOR_ROLES } from '../constants/trip';
import { type ResourcePermissions, type TripActor } from '../model/trip';

/** Trips, their days and their points may only be changed by the owner or a moderator. */
export function canModifyTrip(actor: TripActor, ownerId: string | null): boolean {
    if (ownerId === null) return false;

    return ownerId === actor.id || MODERATOR_ROLES.includes(actor.role);
}

/** Edit/delete rights of one resource for the requesting actor; anonymous callers get none. */
export function toResourcePermissions(actor: TripActor | null, ownerId: string | null): ResourcePermissions {
    const canModify = actor !== null && canModifyTrip(actor, ownerId);

    return { canEdit: canModify, canDelete: canModify };
}
