import dotenv = require('dotenv');
import { PrismaClient } from '@prisma/client';
import { CliOptions, PhaseName, PHASES, getEnv, helpText, parseArgs } from './config';
import { dbName } from './db';
import { preflight, productionGateError } from './preflight';
import { ensureControlTables, finishRun, startRun } from './state';
import { runDdlPhase } from './ddl';
import { phaseTripGroups, phaseUsers } from './phases-a';
import { phaseComments, phasePoints, phaseTrips } from './phases-b';
import { phaseFavorites, phaseLikes } from './phases-c1';
import { phaseReports } from './phases-c2';
import { phaseImages } from './phases-c3';
import { phaseVerify } from './phases-d1';
import { phaseLogs } from './phases-d2';
import { phaseConstraints } from './phases-d3';
import { phasePkswap } from './phases-e1';
import { phaseBackfill } from './phases-e2';
import { phaseGroupfinalize } from './phases-e3';
import { phaseReplay } from './phases-e4';
import { phaseActivate } from './phases-e5';
import { verifyMigration } from './verify';
import { Counters } from './types';

dotenv.config();

async function runPhase(
  prisma: PrismaClient, db: string, runId: number, dryRun: boolean, phase: PhaseName,
  report: Record<string, Counters | unknown>,
): Promise<void> {
  switch (phase) {
    case 'ddl': {
      const ddl = await runDdlPhase(prisma, db, dryRun);
      report['ddl'] = ddl;
      console.log(`[ddl] tables=${ddl.createdTables.length} columns=${ddl.addedColumns.length} target_types_seeded=${ddl.seededTargetTypes.length} skipped=${ddl.skipped.length}`);
      break;
    }
    case 'users': report['users'] = await phaseUsers(prisma, db, runId, dryRun); break;
    case 'tripGroups': report['tripGroups'] = await phaseTripGroups(prisma, db, runId, dryRun); break;
    case 'trips': report['trips'] = await phaseTrips(prisma, db, runId, dryRun); break;
    case 'points': report['points'] = await phasePoints(prisma, db, runId, dryRun); break;
    case 'comments': report['comments'] = await phaseComments(prisma, db, runId, dryRun); break;
    case 'likes': report['likes'] = await phaseLikes(prisma, db, runId, dryRun); break;
    case 'favorites': report['favorites'] = await phaseFavorites(prisma, db, runId, dryRun); break;
    case 'reports': report['reports'] = await phaseReports(prisma, db, runId, dryRun); break;
    case 'images': report['images'] = await phaseImages(prisma, db, runId, dryRun); break;
    case 'verify': report['verify'] = await phaseVerify(prisma, db, runId, dryRun); break;
    case 'logs': report['logs'] = await phaseLogs(prisma, db, runId, dryRun); break;
    case 'pkswap': report['pkswap'] = await phasePkswap(prisma, db, runId, dryRun); break;
    case 'backfill': report['backfill'] = await phaseBackfill(prisma, db, runId, dryRun); break;
    case 'groupfinalize': report['groupfinalize'] = await phaseGroupfinalize(prisma, db, runId, dryRun); break;
    case 'replay': report['replay'] = await phaseReplay(prisma, db, runId, dryRun); break;
    case 'activate': report['activate'] = await phaseActivate(prisma, db, runId, dryRun); break;
    case 'constraints': report['constraints'] = await phaseConstraints(prisma, db); break;
  }
  const r = report[phase] as Counters | undefined;
  if (r && typeof (r as Counters).migrated === 'number') {
    const cc = r as Counters;
    console.log(`[${phase}] migrated=${cc.migrated} skipped=${cc.skipped} quarantined=${cc.quarantined}${dryRun ? ' (dry-run: no writes)' : ''}`);
  }
}

async function main(): Promise<void> {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error('ARG_ERROR ' + (e as Error).message);
    console.error(helpText());
    process.exitCode = 1;
    return;
  }
  if (opts.help) { console.log(helpText()); return; }
  const env = getEnv();
  if (!env.databaseUrl) { console.error('PREFLIGHT_FAIL DATABASE_URL is not set.'); process.exitCode = 2; return; }
  const prisma = new PrismaClient();
  try {
    // Fresh-DB runs (ddl phase) and dry-runs may not have the target DDL yet.
    const wantsDdl = !opts.phase || opts.phase === 'ddl';
    const pf = await preflight(prisma, { allowMissingTargets: opts.dryRun || wantsDdl });
    for (const w of pf.warnings) console.log('PREFLIGHT_WARN ' + w);
    if (!pf.ok) {
      console.error('PREFLIGHT_FAIL');
      for (const f of pf.fatal) console.error('  - ' + f);
      process.exitCode = 2;
      return;
    }
    const db = pf.database || dbName();
    if (opts.verifyOnly) {
      const v = await verifyMigration(prisma, db, 0, { verifyOnly: true });
      console.log('VERIFY-REPORT (read-only)');
      for (const l of v.lines) console.log(`  ${l.entity}: source=${l.source} mapped=${l.mapped} quarantined=${l.quarantined}`);
      console.log('FINALIZATION-CHECKS:');
      for (const f of v.finalization) console.log(`  [${f.ok ? 'OK' : 'PENDING'}] ${f.check} — ${f.detail}`);
      return;
    }
    if (pf.isProduction && !(env.allowProduction && opts.confirmProduction)) {
      console.error('PRODUCTION_GATE_REFUSE');
      for (const f of productionGateError()) console.error('  - ' + f);
      process.exitCode = 2;
      return;
    }
    if (pf.isProduction && !env.backupRef) {
      console.error('PREFLIGHT_FAIL production target requires MIGRATION_BACKUP_REF.');
      process.exitCode = 2;
      return;
    }
    if (pf.isProduction) console.log(`PRODUCTION_CONFIRMED backup=${env.backupRef}`);
    else console.log(`TARGET localhost database=${db} (test/dev)`);
    // --phase runs may skip ddl, so ensure the control tables here.
    if (!opts.dryRun) await ensureControlTables(prisma, db);
    const runId = opts.dryRun ? 0 : await startRun(prisma, db, false);
    if (opts.dryRun) console.log('DRY-RUN active: validation + mapping report only, no writes.');
    else console.log(`RUN started id=${runId}`);
    const report: Record<string, Counters | unknown> = {};
    const phases = opts.phase ? PHASES.filter((p) => p === opts.phase) : [...PHASES];
    console.log('PHASES: ' + phases.join(','));
    for (const phase of phases) {
      await runPhase(prisma, db, runId, opts.dryRun, phase, report);
    }
    const v = await verifyMigration(prisma, db, runId, { dryRun: opts.dryRun });
    console.log(opts.dryRun ? 'DRY-RUN-REPORT (no writes performed)' : 'MIGRATION-REPORT');
    for (const l of v.lines) console.log(`  ${l.entity}: source=${l.source} mapped=${l.mapped} quarantined=${l.quarantined}`);
    console.log('FINALIZATION-CHECKS:');
    for (const f of v.finalization) console.log(`  [${f.ok ? 'OK' : 'PENDING'}] ${f.check} — ${f.detail}`);
    const cc = report['constraints'] as { checks?: Array<{ statement: string; ok: boolean; detail: string }> } | undefined;
    if (cc && cc.checks) {
      console.log('CONSTRAINT-READINESS (activation is a later step):');
      for (const chk of cc.checks) console.log(`  [${chk.ok ? 'OK' : 'BLOCKED'}] ${chk.statement} — ${chk.detail}`);
    }
    if (!opts.dryRun) await finishRun(prisma, db, runId, 'COMPLETED', '');
    console.log(opts.dryRun ? 'DRY-RUN complete.' : `RUN ${runId} completed.`);
  } catch (e) {
    console.error('MIGRATION_FAILED ' + (e as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
