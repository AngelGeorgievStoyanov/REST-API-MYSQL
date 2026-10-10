/**
 * Likes: every legacy `trips.likes` token -> likes(userId, targetTypeId=trip,
 * targetId=trips.id). Favorites attach to the trip GROUP, so the trip UUID is
 * resolved to its group and the final trip_groups.id (never trips.id).
 */
import { type PrismaClient } from '@prisma/client';
import { TARGET_TYPE } from './db';
import { migrateUserTokenList, tripGroupParentResolver, tripParentResolver } from './targets';
import { type Counters } from './types';

export const phaseLikes = (prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> =>
  migrateUserTokenList(prisma, db, runId, dryRun, {
    entity: 'Like',
    targetTable: 'likes',
    sourceTable: 'trips',
    sourceColumn: 'likes',
    targetColumn: 'targetId',
    targetTypeId: TARGET_TYPE.trip,
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
