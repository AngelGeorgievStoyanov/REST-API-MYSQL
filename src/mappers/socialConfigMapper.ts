import { type SocialConfig, type SocialConfigResponse } from '../model/config';

/** Add the legacy operation flags from the canonical operations map. */
export function toSocialConfigResponse(config: readonly SocialConfig[]): { social: SocialConfigResponse[] } {
    return {
        social: config.map((action) => ({
            ...action,
            targets: action.targets.map((target) => ({
                ...target,
                create: target.operations['create'] === true,
                edit: target.operations['edit'] === true,
                delete: target.operations['delete'] === true,
            })),
        })),
    };
}
