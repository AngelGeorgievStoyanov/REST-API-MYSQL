/**
 * PHASE 4 — per-phase migration, part C2a (commentReports).
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, esc, inTx, isUuid, qi, qtable, splitList } from './db';
import { isStateUnavailable, lookupState, lookupStateOrPending, quarantineDryAware, recordState } from './state';
import { Counters } from './types';

async function userExists(exec: DbExecutor, db: string, id: string): Promise<boolean> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT 1 AS ok FROM ${qtable(db, 'users')} WHERE ${qi('_id')} = '${esc(id)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

export async function phaseCommentReports(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  // Post-pkswap the comments table has NO `_id` column. Resolve the
  // comment's legacy UUID via legacyId when `_id` is gone.
  const commentsHasUuid = (
    (await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = 'comments' AND COLUMN_NAME = '_id' LIMIT 1`,
    )) as Array<{ ok: number }>
  ).length > 0;
  const cidExpr = commentsHasUuid ? qi('_id') : qi('legacyId');
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ${cidExpr} AS legacyComment, ${qi('reportComment')} AS raw FROM ${qtable(db, 'comments')}`,
  )) as Array<{ legacyComment: unknown; raw: unknown }>;
  const run = async (exec: DbExecutor): Promise<Counters> => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    for (const r of rows) {
      const legacyComment = String(r.legacyComment ?? '');
      let cid: number | null = null;
      let pending = false;
      try {
        cid = await lookupState(exec, db, dryRun, 'Comment', legacyComment);
      } catch (e) {
        if (!isStateUnavailable(e)) throw e;
        pending = true;
      }
      if (pending || cid === 0) {
        const toks = splitList(r.raw);
        if (toks.length > 0) c.skipped += toks.length;
        continue;
      }
      if (cid === null) {
        const toks = splitList(r.raw);
        await quarantineDryAware(exec, db, dryRun, runId, 'CommentReport', legacyComment, 'ORPHAN_COMMENT', `Parent comment not migrated; ${toks.length} token(s) held.`, { tokens: toks });
        if (toks.length > 0) c.quarantined++;
        continue;
      }
      const seen = new Set<string>();
      for (const tok of splitList(r.raw)) {
        if (seen.has(tok)) { if (await quarantineDryAware(exec, db, dryRun, runId, 'CommentReport', legacyComment, 'DUPLICATE', 'Duplicate token in one legacy row.', { user: tok })) c.quarantined++; continue; }
        seen.add(tok);
        if (!isUuid(tok)) { await quarantineDryAware(exec, db, dryRun, runId, 'CommentReport', legacyComment, 'MALFORMED_LIKE', 'Not a canonical UUID; no guessing.', { token: tok }); c.quarantined++; continue; }
        if (!(await userExists(exec, db, tok))) { if (await quarantineDryAware(exec, db, dryRun, runId, 'CommentReport', legacyComment, 'UNKNOWN_USER', 'No surviving user.', { user: tok })) c.quarantined++; continue; }
        const key = tok + '|||' + cid;
        const already = await lookupStateOrPending(exec, db, dryRun, 'CommentReport', key);
        if (already !== null) { c.skipped++; continue; }
        if (dryRun) { c.migrated++; continue; }
        await exec.$executeRawUnsafe(
          `INSERT IGNORE INTO ${qtable(db, 'comment_reports')} (${qi('userId')}, ${qi('commentId')}) VALUES ('${esc(tok)}', ${cid})`,
        );
        const idRows = (await exec.$queryRawUnsafe(
          `SELECT ${qi('id')} AS id FROM ${qtable(db, 'comment_reports')} WHERE ${qi('userId')} = '${esc(tok)}' AND ${qi('commentId')} = ${cid} LIMIT 1`,
        )) as Array<{ id: number | bigint }>;
        await recordState(exec, db, 'CommentReport', key, Number(idRows[0].id), runId);
        c.migrated++;
      }
    }
    return c;
  };
  if (dryRun) return run(prisma);
  let out: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  await inTx(prisma, async (tx) => {
    out = await run(tx);
  });
  return out;
}
