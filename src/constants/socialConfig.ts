import { type SocialConfig } from '../model/config';

export const SOCIAL_OPERATIONS = ['create', 'edit', 'delete'] as const;
export type SocialOperation = (typeof SOCIAL_OPERATIONS)[number];
export type SocialAction = 'like' | 'favorite' | 'report' | 'comment' | 'replyComment';
export type SocialTarget = 'tripGroup' | 'trip' | 'point' | 'image' | 'comment';

type Capability = Partial<Record<SocialTarget, readonly SocialOperation[]>>;

/** Code allowlist: configuration can disable capabilities but cannot invent them. */
export const SOCIAL_CAPABILITIES: Readonly<Record<SocialAction, Capability>> = {
    like: { tripGroup: ['create', 'delete'] },
    favorite: { tripGroup: ['create', 'delete'] },
    report: { tripGroup: ['create', 'delete'], comment: ['create', 'delete'] },
    comment: { trip: ['create'], point: ['create'], comment: ['edit', 'delete'] },
    replyComment: { comment: ['create', 'edit', 'delete'] },
};

export const SOCIAL_CONTEXT_CAPABILITIES = {
    replyComment: { comment: ['point'] },
} as const;

const disabledOperations = () => ({ create: false, edit: false, delete: false });
const enabledOperations = (...enabled: SocialOperation[]) => ({
    create: enabled.includes('create'),
    edit: enabled.includes('edit'),
    delete: enabled.includes('delete'),
});

function target(key: SocialTarget, operations: ReturnType<typeof disabledOperations> = disabledOperations()) {
    return { key, operations };
}

export const SOCIAL_CONFIG: readonly SocialConfig[] = [
    {
        key: 'like', isActive: true,
        targets: [target('tripGroup', enabledOperations('create', 'delete')), target('trip'), target('point'), target('image'), target('comment')],
    },
    {
        key: 'favorite', isActive: true,
        targets: [target('tripGroup', enabledOperations('create', 'delete')), target('trip'), target('point'), target('image'), target('comment')],
    },
    {
        key: 'report', isActive: true,
        targets: [target('tripGroup', enabledOperations('create', 'delete')), target('trip'), target('point'), target('image'), target('comment', enabledOperations('create', 'delete'))],
    },
    {
        key: 'comment', isActive: true,
        targets: [target('tripGroup'), target('trip', enabledOperations('create')), target('point', enabledOperations('create')), target('image'), target('comment', enabledOperations('edit', 'delete'))],
    },
    {
        key: 'replyComment', isActive: true,
        targets: [
            target('tripGroup'), target('trip'), target('point'), target('image'),
            {
                key: 'comment', operations: disabledOperations(),
                contextRules: [{ key: 'point', operations: enabledOperations('create', 'edit', 'delete') }],
            },
        ],
    },
];
