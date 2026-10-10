import { type Prisma } from '@prisma/client';
import { COMMENT_TARGET_TYPE, SOCIAL_TARGET_TYPE } from '../constants/social';

/**
 * Central social cleanup for deleted resources.
 *
 * Every polymorphic social relationship is removed through this module, so a
 * resource DELETE never has to know which social features exist. The single
 * extension point is `SOCIAL_RELATION_DELETERS`: a new social feature
 * (reactions, shares, favorites on points, ...) is integrated by adding its
 * batch deleter there, and every delete flow that already calls
 * `deleteSocialRecordsForTargets` picks it up automatically.
 *
 * The whole cleanup runs inside the same database transaction as the resource
 * row delete it belongs to, with bounded batch queries: one `deleteMany` per
 * relationship, matching any number of targets through a single
 * `(targetTypeId, targetId IN (...))` filter.
 */

/** One polymorphic target to clean: `targetType` is a `target_types.name`. */
export interface SocialCleanupTarget {
    targetType: string;
    targetId: number;
}

/** Builds one cleanup target per id of the same target type. */
export function socialCleanupTargets(targetType: string, targetIds: number[]): SocialCleanupTarget[] {
    return targetIds.map((targetId) => ({ targetType, targetId }));
}

/** Targets of one `target_types` row, merged for a single batch filter. */
interface SocialCleanupGroup {
    targetType: string;
    targetTypeId: number;
    targetIds: number[];
}

interface PolymorphicTargetFilter {
    OR: { targetTypeId: number; targetId: { in: number[] } }[];
}

type SocialRelationDeleter = (tx: Prisma.TransactionClient, groups: SocialCleanupGroup[]) => Promise<void>;

/** Shared `(targetTypeId, targetId)` filter of every polymorphic social table. */
function polymorphicTargetFilter(groups: SocialCleanupGroup[]): PolymorphicTargetFilter {
    return {
        OR: groups.map((group) => ({ targetTypeId: group.targetTypeId, targetId: { in: group.targetIds } })),
    };
}

async function deleteComments(tx: Prisma.TransactionClient, groups: SocialCleanupGroup[]): Promise<void> {
    await tx.comment.deleteMany({ where: polymorphicTargetFilter(groups) });
}

async function deleteLikes(tx: Prisma.TransactionClient, groups: SocialCleanupGroup[]): Promise<void> {
    await tx.like.deleteMany({ where: polymorphicTargetFilter(groups) });
}

async function deleteReports(tx: Prisma.TransactionClient, groups: SocialCleanupGroup[]): Promise<void> {
    await tx.report.deleteMany({ where: polymorphicTargetFilter(groups) });
}

/**
 * Favorites are attached to a trip group through their own foreign key
 * (`favorites.tripGroupId`), not through `targetTypeId`/`targetId`. The FK is
 * NO ACTION, so a favorite left behind would block the group delete; the
 * cleanup therefore removes it before the trip group row is deleted.
 */
async function deleteFavorites(tx: Prisma.TransactionClient, groups: SocialCleanupGroup[]): Promise<void> {
    const tripGroupIds = groups
        .filter((group) => group.targetType === SOCIAL_TARGET_TYPE.TRIP_GROUP)
        .flatMap((group) => group.targetIds);
    if (tripGroupIds.length === 0) return;

    await tx.favorite.deleteMany({ where: { tripGroupId: { in: [...new Set(tripGroupIds)] } } });
}

/**
 * The registry: one batch deleter per social relationship. Only this list has to
 * change when a new social feature is added; no resource delete flow is touched.
 */
const SOCIAL_RELATION_DELETERS: readonly SocialRelationDeleter[] = [
    deleteComments,
    deleteLikes,
    deleteReports,
    deleteFavorites,
];

/**
 * Deletes every social record targeting any of the given targets, together with
 * the social records of the comments that this cleanup removes — comments are
 * report targets, so the reports pointing at them must not stay behind.
 */
export async function deleteSocialRecordsForTargets(
    tx: Prisma.TransactionClient,
    targets: SocialCleanupTarget[],
): Promise<void> {
    if (targets.length === 0) return;

    const typeRows = await tx.targetType.findMany({ select: { id: true, name: true } });
    const typeIdByName = new Map(typeRows.map((row) => [row.name, row.id]));

    const idsByType = new Map<string, number[]>();
    for (const target of targets) {
        const ids = idsByType.get(target.targetType);
        if (ids) ids.push(target.targetId);
        else idsByType.set(target.targetType, [target.targetId]);
    }

    const groups: SocialCleanupGroup[] = [];
    for (const [targetType, ids] of idsByType) {
        const targetTypeId = typeIdByName.get(targetType);
        if (targetTypeId === undefined) continue;
        groups.push({ targetType, targetTypeId, targetIds: [...new Set(ids)] });
    }
    if (groups.length === 0) return;

    // Comments on the deleted resources are themselves report targets, so their
    // ids are collected before the comment rows are removed; `deleteReports`
    // then clears the reports pointing at them in the same pass. This is the one
    // cascade a polymorphic relationship needs on top of the direct filters: it
    // is the relationship whose rows are a target of another relationship.
    const commentTypeId = typeIdByName.get(COMMENT_TARGET_TYPE);
    if (commentTypeId !== undefined) {
        const comments = await tx.comment.findMany({
            where: polymorphicTargetFilter(groups),
            select: { id: true },
        });
        if (comments.length > 0) {
            groups.push({
                targetType: COMMENT_TARGET_TYPE,
                targetTypeId: commentTypeId,
                targetIds: comments.map((comment) => comment.id),
            });
        }
    }

    for (const deleteRelation of SOCIAL_RELATION_DELETERS) {
        // eslint-disable-next-line no-await-in-loop -- sequential batch deleters required for referential integrity
        await deleteRelation(tx, groups);
    }
}

