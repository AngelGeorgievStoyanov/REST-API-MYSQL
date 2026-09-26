import { PrismaClient } from '@prisma/client';

/**
 * Central Prisma client configuration (PHASE 2 — Prisma integration).
 *
 * This is the ONLY place in the codebase that creates `new PrismaClient()`.
 * All future Prisma consumers must import this shared instance instead of
 * creating their own clients.
 *
 * The old MySQL layer (src/db, src/services, the `mysql` pool) is intentionally
 * kept untouched for now, so both data-access paths can coexist during the
 * gradual migration.
 */
export const prisma = new PrismaClient();

export default prisma;