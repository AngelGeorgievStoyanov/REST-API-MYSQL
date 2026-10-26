import { type SocialConfig } from '../model/config';

export const SOCIAL_OPERATIONS = ['create', 'edit', 'delete'] as const;
export type SocialOperation = (typeof SOCIAL_OPERATIONS)[number];
export type SocialAction = 'like' | 'favorite' | 'report' | 'comment' | 'replyComment';
export type SocialTarget = 'tripGroup' | 'trip' | 'point' | 'image' | 'comment';

type Capability = Partial<Record<SocialTarget, readonly SocialOperation[]>>;

/** Code allowlist: configuration can disable capabilities but cannot invent them. */
export const SOCIAL_CAPABILITIES: Readonly<Record<SocialAction, Capability>> = {
    like: {
        tripGroup: ['create', 'delete'], trip: ['create', 'delete'], point: ['create', 'delete'],
        image: ['create', 'delete'], comment: ['create', 'delete'],
    },
    favorite: {
        tripGroup: ['create', 'delete'], trip: ['create', 'delete'], point: ['create', 'delete'],
        image: ['create', 'delete'], comment: ['create', 'delete'],
    },
    report: {
        tripGroup: ['create', 'delete'],
        trip: ['create', 'delete'],
        point: ['create', 'delete'],
        image: ['create', 'delete'],
        comment: ['create', 'delete'],
    },
    comment: {
        tripGroup: ['create'],
        trip: ['create'],
        point: ['create'],
        image: ['create'],
        comment: ['edit', 'delete'],
    },
    replyComment: { comment: ['create', 'edit', 'delete'] },
};

export const SOCIAL_CONTEXT_CAPABILITIES = {
    replyComment: { comment: ['tripGroup', 'trip', 'point', 'image'] },
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
        targets: [target('tripGroup', enabledOperations('create', 'delete')), target('trip', enabledOperations('create', 'delete')), target('point', enabledOperations('create', 'delete')), target('image', enabledOperations('create', 'delete')), target('comment', enabledOperations('create', 'delete'))],
    },
    {
        key: 'favorite', isActive: true,
        targets: [target('tripGroup', enabledOperations('create', 'delete')), target('trip', enabledOperations('create', 'delete')), target('point', enabledOperations('create', 'delete')), target('image', enabledOperations('create', 'delete')), target('comment', enabledOperations('create', 'delete'))],
    },
    {
        key: 'report', isActive: true,
        targets: [
            target('tripGroup', enabledOperations('create', 'delete')),
            target('trip', enabledOperations('create', 'delete')),
            target('point', enabledOperations('create', 'delete')),
            target('image', enabledOperations('create', 'delete')),
            target('comment', enabledOperations('create', 'delete')),
        ],
    },
    {
        key: 'comment', isActive: true,
        targets: [
            target('tripGroup', enabledOperations('create')),
            target('trip', enabledOperations('create')),
            target('point', enabledOperations('create')),
            target('image', enabledOperations('create')),
            target('comment', enabledOperations('edit', 'delete')),
        ],
    },
    {
        key: 'replyComment', isActive: true,
        targets: [
            target('tripGroup'), target('trip'), target('point'), target('image'),
            {
                key: 'comment', operations: disabledOperations(),
                contextRules: SOCIAL_CONTEXT_CAPABILITIES.replyComment.comment.map((key) => ({
                    key,
                    operations: enabledOperations('create', 'edit', 'delete'),
                })),
            },
        ],
    },
];
