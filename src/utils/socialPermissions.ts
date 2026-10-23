import { type TripActor } from '../model/trip';
import { ApiError } from './apiError';
import { dynamicConfig } from '../services/dynamicConfig';

export type SocialAction = 'like' | 'favorite' | 'report' | 'comment' | 'replyComment';
export type SocialTargetType = 'tripGroup' | 'trip' | 'point' | 'image' | 'comment';
export type SocialOperation = 'create' | 'edit' | 'delete';

/**
 * Checks whether the authenticated actor is permitted to perform the given
 * social action on the given target type with the requested operation.
 *
 * The check is purely configuration-driven: it reads the current dynamic
 * configuration and verifies that the action is active, the target type is
 * configured for that action, and the requested operation is enabled.
 *
 * It does NOT check ownership or resource-level authorization; those remain
 * the responsibility of the calling service/repository layer.
 *
 * Throws ApiError.forbidden() when the operation is not permitted.
 */
export function checkSocialPermission(
    _actor: TripActor,
    action: SocialAction,
    targetType: SocialTargetType,
    operation: SocialOperation,
): void {
    const socialConfig = dynamicConfig.getSocialConfig();

    // 1. Does the configured action exist?
    const actionConfig = socialConfig.find((a) => a.key === action);
    if (!actionConfig) {
        throw ApiError.forbidden(`Action "${action}" is not configured.`);
    }

    // 2. Is the action globally active?
    if (!actionConfig.isActive) {
        throw ApiError.forbidden(`Action "${action}" is disabled.`);
    }

    // 3. Does the configured target exist for that action?
    const targetConfig = actionConfig.targets.find((t) => t.key === targetType);
    if (!targetConfig) {
        throw ApiError.forbidden(
            `Target "${targetType}" is not supported for action "${action}".`,
        );
    }

    // 4. Is the requested operation enabled for that target?
    if (!targetConfig[operation]) {
        throw ApiError.forbidden(
            `Operation "${operation}" is not enabled for "${action}" on "${targetType}".`,
        );
    }
}
