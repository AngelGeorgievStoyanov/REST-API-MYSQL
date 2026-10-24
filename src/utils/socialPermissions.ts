import { SOCIAL_CAPABILITIES, SOCIAL_CONTEXT_CAPABILITIES, SOCIAL_OPERATIONS, type SocialAction, type SocialOperation, type SocialTarget } from '../constants/socialConfig';
import { type TripActor } from '../model/trip';
import { dynamicConfig } from '../services/dynamicConfig';
import { ApiError } from './apiError';

export interface SocialPermissionContext {
    parentTargetType: SocialTarget;
}

export function checkSocialPermission(
    _actor: TripActor,
    action: SocialAction,
    targetType: SocialTarget,
    operation: SocialOperation,
    context?: SocialPermissionContext,
): void {
    const actionConfig = dynamicConfig.getSocialConfig().find((item) => item.key === action);
    if (!actionConfig) throw ApiError.forbidden(`Action "${action}" is not configured.`);
    if (!isValidConfiguration(actionConfig)) {
        throw ApiError.forbidden(`Action "${action}" has an invalid configuration.`);
    }
    if (!actionConfig.isActive) throw ApiError.forbidden(`Action "${action}" is disabled.`);

    const supportedOperations = SOCIAL_CAPABILITIES[action][targetType];
    if (!supportedOperations?.includes(operation)) {
        throw ApiError.forbidden(`Operation "${operation}" is not supported for "${action}" on "${targetType}".`);
    }

    const targetConfig = actionConfig.targets.find((item) => item.key === targetType);
    if (!targetConfig) throw ApiError.forbidden(`Target "${targetType}" is not configured for action "${action}".`);

    let enabled = targetConfig.operations[operation] === true;
    if (action === 'replyComment') {
        if (!context) throw ApiError.forbidden('The parent comment context is required.');
        const contextualRule = targetConfig.contextRules?.find((rule) => rule.key === context.parentTargetType);
        enabled = contextualRule?.operations[operation] === true;
    } else if (context) {
        throw ApiError.forbidden('This action does not accept contextual permissions.');
    }

    if (!enabled) throw ApiError.forbidden(`Operation "${operation}" is not enabled for "${action}" on "${targetType}".`);
}

function isValidConfiguration(value: unknown): boolean {
    if (!isRecord(value) || typeof value['key'] !== 'string' || typeof value['isActive'] !== 'boolean' || !Array.isArray(value['targets'])) return false;
    if (!Object.prototype.hasOwnProperty.call(SOCIAL_CAPABILITIES, value['key'])) return false;
    const configKey = value['key'] as SocialAction;
    const capability = SOCIAL_CAPABILITIES[configKey];
    const seenTargets = new Set<string>();
    for (const rawTarget of value['targets']) {
        if (!isRecord(rawTarget) || typeof rawTarget['key'] !== 'string' || !isRecord(rawTarget['operations'])) return false;
        const targetKey = rawTarget['key'];
        if (seenTargets.has(targetKey)) return false;
        seenTargets.add(targetKey);
        const targetCapability = capability[targetKey as SocialTarget];
        if (!targetCapability && Object.values(rawTarget['operations']).some(Boolean)) return false;
        if (Object.entries(rawTarget['operations']).some(([key, enabled]) => typeof enabled !== 'boolean' || !SOCIAL_OPERATIONS.includes(key as SocialOperation) || (enabled && !targetCapability?.includes(key as SocialOperation)))) return false;
        const seenContexts = new Set<string>();
        const rules = rawTarget['contextRules'] ?? [];
        if (!Array.isArray(rules)) return false;
        for (const rawRule of rules) {
            if (!isRecord(rawRule) || typeof rawRule['key'] !== 'string' || !isRecord(rawRule['operations'])) return false;
            const ruleKey = rawRule['key'];
            if (seenContexts.has(ruleKey) || configKey !== 'replyComment' || targetKey !== 'comment') return false;
            seenContexts.add(ruleKey);
            const allowedContexts = SOCIAL_CONTEXT_CAPABILITIES.replyComment.comment;
            if (!(allowedContexts as readonly string[]).includes(ruleKey)) return false;
            if (Object.entries(rawRule['operations']).some(([key, enabled]) => typeof enabled !== 'boolean' || !SOCIAL_OPERATIONS.includes(key as SocialOperation) || (enabled && !targetCapability?.includes(key as SocialOperation)))) return false;
        }
    }
    return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
