/**
 * PHASE 4 — per-phase migration, part C1 (likes, favorites).
 *
 * Final shapes (prisma/schema.prisma + live target):
 *   likes(userId, targetTypeId, targetId) — a like is a (user, polymorphic
 *     target) pair. Every legacy token in `trips.likes` is a trip like, so it
 *     becomes targetTypeId = 2 (trip) + targetId = the final INT trips.id.
 *     There is NO likes.tripId in the final DB.
 *   favorites(userId, tripGroupId) — favorites attach to the trip GROUP, not a
 *     single day row. The legacy token lives on a trip row, so the legacy trip
 *     UUID is resolved to its legacy group UUID and then to the final INT
 *     `trip_groups.id` (never `trips.id`).
 *
 * Token handling is shared with the reports phase (see ./targets.ts): split on
 * commas/whitespace, quarantine anything that is not a canonical UUID or has no
 * surviving user, never split or invent a token.
 */
import { PrismaClient } from '@prisma/client';
import { TARGET_TYPE } from './db';
import { migrateUserTokenList, tripGroupParentResolver, tripParentResolver } from './targets';
import { Counters } from './types';

export const phaseLikes = (prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> =>
  migrateUserTokenList(prisma, db, runId, dryRun, {
    entity: 'Like',
    targetTable: 'likes',
    sourceTable: 'trips',
    sourceColumn: 'likes',
    targetColumn: 'targetId',
    targetTypeId: TARGET_TYPE.trip,
    // The already-verified key shape for likes: `<user>|||<trips.id>`.
    stateKey: (token, tripId) => `${token}|||${tripId}`,
    malformedCode: 'MALFORMED_LIKE',
    orphanCode: 'ORPHAN_TRIP',
    parentLabel: 'Parent trip',
    resolve: tripParentResolver(db, dryRun),
  });

export const phaseFavorites = (prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> =>
  migrateUserTokenList(prisma, db, runId, dryRun, {
    entity: 'Favorite',
    targetTable: 'favorites',
    sourceTable: 'trips',
    sourceColumn: 'favorites',
    targetColumn: 'tripGroupId',
    targetTypeId: null,
    stateKey: (token, groupId) => `${token}|||${groupId}`,
    malformedCode: 'MALFORMED_TOKEN',
    orphanCode: 'ORPHAN_TRIP_GROUP',
    parentLabel: 'Parent trip group',
    resolve: tripGroupParentResolver(db, dryRun),
  });
