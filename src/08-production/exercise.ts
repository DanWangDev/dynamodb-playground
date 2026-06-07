/**
 * Module 08 Exercise: Production Features
 *
 * Run: npm run exercise:production  (or: npx tsx src/08-production/exercise.ts)
 *
 * Covers: Global Tables, PITR/Backups, DAX
 * Note: Most operations here are read-only API inspections.
 * Actual global table / PITR enablement requires AWS CLI or console.
 */

import { createClientFromEnv } from "../config/dynamodb";
import { env } from "../config/env";
import { createLogger } from "../shared/logger";
import {
  DescribeTableCommand,
  DescribeContinuousBackupsCommand,
  ListBackupsCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";

const log = createLogger("08-production");
const ORDERS_TABLE = `${env.DDB_TABLE_PREFIX}orders`;

async function run(): Promise<void> {
  const { raw } = createClientFromEnv(env);

  log.section("Module 08: Production Features");
  console.log(
    "Global Tables, Point-in-Time Recovery, Backups & DAX\n",
  );

  // ─── Step 1: Global Tables ────────────────────────────────────
  log.section("Step 1: Global Tables — Multi-Region Replication");

  log.concept(
    "Global Tables replicate a DynamoDB table across multiple AWS regions.\n" +
      "  • Multi-active: every region can read AND write\n" +
      "  • Conflict resolution: last-writer-wins (timestamp-based)\n" +
      "  • Replication lag: typically < 1 second\n" +
      "  • Cost: $1.875 per million replicated writes\n" +
      "  • Requires DynamoDB Streams to be enabled first",
  );

  log.step("Checking if any tables have replicas (global table status)...");
  try {
    const listResult = await raw.send(new ListTablesCommand({}));
    const tables = listResult.TableNames ?? [];
    let globalTableCount = 0;

    for (const tableName of tables) {
      const desc = await raw.send(
        new DescribeTableCommand({ TableName: tableName }),
      );
      const replicas = desc.Table?.Replicas ?? [];
      if (replicas.length > 0) {
        globalTableCount++;
        console.log(
          `  🌍 ${tableName}: ${replicas.length} replica(s) — ${replicas.map((r: any) => r.RegionName).join(", ")}`,
        );
      }
    }

    if (globalTableCount === 0) {
      console.log("  No global tables found. This is expected — global tables are");
      console.log("  configured manually via AWS CLI or console for production use.");
    }
  } catch (error) {
    log.warn(`Couldn't list tables: ${error instanceof Error ? error.message : error}`);
  }

  log.info("To create a global table:");
  console.log("  1. Enable streams on the source table (NEW_AND_OLD_IMAGES)");
  console.log("  2. aws dynamodb update-table --table-name <name> \\");
  console.log("       --replica-updates '[{\"Create\": {\"RegionName\": \"us-east-1\"}}]'");
  console.log("  3. Repeat for each additional region");

  // ─── Step 2: PITR ────────────────────────────────────────────
  log.section("Step 2: Point-in-Time Recovery (PITR) — Continuous Backup");

  log.concept(
    "PITR continuously backs up your table for the last 35 days.\n" +
      "  • Restore to any SECOND within the 35-day window\n" +
      "  • Creates a NEW table (never overwrites the original)\n" +
      "  • Cost: $0.20 per GB-month\n" +
      "  • NOT enabled by default — you must turn it on",
  );

  log.step("Checking PITR status on playground tables...");
  try {
    const pitrResult = await raw.send(
      new DescribeContinuousBackupsCommand({
        TableName: ORDERS_TABLE,
      }),
    );

    const pitrStatus =
      pitrResult.ContinuousBackupsDescription
        ?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus ?? "DISABLED";
    const earliest =
      pitrResult.ContinuousBackupsDescription
        ?.PointInTimeRecoveryDescription?.EarliestRestorableDateTime;

    console.log(`  ${ORDERS_TABLE}: PITR is ${pitrStatus}`);
    if (earliest) {
      console.log(`    Earliest restorable: ${earliest.toISOString()}`);
    }
  } catch (error) {
    log.warn(`Couldn't check PITR: ${error instanceof Error ? error.message : error}`);
    log.info("PITR may not be enabled on this table (it's off by default).");
  }

  log.info("To enable PITR:");
  console.log("  aws dynamodb update-continuous-backups \\");
  console.log("    --table-name <name> \\");
  console.log("    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true");
  console.log("");
  console.log("To restore (creates a NEW table):");
  console.log("  aws dynamodb restore-table-to-point-in-time \\");
  console.log("    --source-table-name <name> \\");
  console.log("    --target-table-name <name>_restored \\");
  console.log("    --restore-date-time 2024-01-01T12:00:00Z");

  // ─── Step 3: On-Demand Backups ────────────────────────────────
  log.section("Step 3: On-Demand Backups — Long-Term Snapshots");

  log.concept(
    "On-demand backups persist until you explicitly delete them.\n" +
      "  • No expiration — good for compliance and pre-deployment snapshots\n" +
      "  • Cost: $0.10 per GB-month\n" +
      "  • Can copy to another region for disaster recovery",
  );

  log.step("Listing existing backups...");
  try {
    const backupsResult = await raw.send(
      new ListBackupsCommand({}),
    );
    const backups = backupsResult.BackupSummaries ?? [];

    if (backups.length === 0) {
      console.log("  No backups found. Create one with:");
      console.log("    aws dynamodb create-backup \\");
      console.log("      --table-name playground_orders \\");
      console.log("      --backup-name orders-$(date +%Y%m%d)");
    } else {
      for (const backup of backups) {
        console.log(
          `  💾 ${backup.BackupName ?? "unnamed"} — ${backup.TableName} — ${backup.BackupStatus} — ${backup.BackupCreationDateTime?.toISOString()}`,
        );
      }
      console.log(`  Total: ${backups.length} backup(s)`);
    }
  } catch (error) {
    log.warn(`Couldn't list backups: ${error instanceof Error ? error.message : error}`);
  }

  log.info("Backup commands:");
  console.log("  Create:  aws dynamodb create-backup --table-name <t> --backup-name <name>");
  console.log("  List:    aws dynamodb list-backups");
  console.log("  Restore: aws dynamodb restore-table-from-backup --target-table-name <new> --backup-arn <arn>");
  console.log("  Delete:  aws dynamodb delete-backup --backup-arn <arn>");
  console.log("  Copy:    aws dynamodb copy-backup --source-backup-arn <arn> --target-backup-name <name> --target-region us-east-1");

  // ─── Step 4: DAX ──────────────────────────────────────────────
  log.section("Step 4: DAX — DynamoDB Accelerator (In-Memory Cache)");

  log.concept(
    "DAX is an in-memory cache cluster that reduces read latency to MICROSECONDS.\n" +
      "  • Write-through cache: writes go through DAX to DynamoDB\n" +
      "  • Eventually-consistent reads from cache (microseconds)\n" +
      "  • Strongly-consistent reads bypass DAX (go straight to DynamoDB)\n" +
      "  • Runs in your VPC — not publicly accessible\n" +
      "  • Minimum cost: ~$250/month for 3-node t2.small cluster\n" +
      "  • No free tier",
  );

  console.log("DAX Architecture:");
  console.log("  App → DAX Client (embedded) → DAX Cluster (VPC) → DynamoDB");
  console.log("");
  console.log("When to use DAX:");
  console.log("  ✓ Read-heavy workloads with repeatable queries");
  console.log("  ✓ Microsecond latency requirements");
  console.log("  ✓ Existing DynamoDB where latency is the bottleneck");
  console.log("");
  console.log("When NOT to use DAX:");
  console.log("  ✗ Write-heavy workloads (DAX doesn't accelerate writes)");
  console.log("  ✗ Unique queries (no cache hits = cache miss penalty)");
  console.log("  ✗ Strong consistency requirements (bypasses DAX)");
  console.log("  ✗ Budget-constrained projects ($250+/month minimum)");
  console.log("  ✗ You can solve it with ElastiCache or CloudFront instead");

  log.info("DAX is configured via AWS CLI/Console, not programmatically.");
  console.log("See: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.html");

  // ─── Step 5: Cost Comparison ──────────────────────────────────
  log.section("Step 5: Cost Comparison — All Production Features");

  console.log("Monthly cost estimates (eu-west-2, 100GB table):");
  console.log("");
  console.log("  Feature              | Cost/mo     | Notes");
  console.log("  ---------------------+-------------+-------------------------");
  console.log("  Base table           | $25.00      | 100GB storage only");
  console.log("  PITR                 | $20.00      | 100GB × $0.20/GB-month");
  console.log("  On-demand backups    | $10.00      | 100GB × $0.10/GB-month");
  console.log("  Global Tables (1 rep)| $50+        | Double storage + replication");
  console.log("  DAX (3× t2.small)    | $250.00     | Flat cluster cost");
  console.log("  ---------------------+-------------+-------------------------");
  console.log("  Total (all features) | $355.00+    | Plus read/write capacity");
  console.log("");

  log.concept(
    "Bottom line: each production feature adds value AND cost.\n" +
      "  • Start with PITR — it's the cheapest safety net ($20/month for 100GB)\n" +
      "  • Add Global Tables when you genuinely need multi-region\n" +
      "  • Only add DAX when latency is the proven bottleneck\n" +
      "  • On-demand backups for compliance / pre-deployment snapshots",
  );

  // ─── Summary ──────────────────────────────────────────────────
  log.section("Summary: What You Learned");
  console.log("  1. Global Tables enable multi-active multi-region replication");
  console.log("  2. Global Tables use last-writer-wins conflict resolution");
  console.log("  3. PITR provides 35-day continuous backup with per-second granularity");
  console.log("  4. On-demand backups persist forever until explicitly deleted");
  console.log("  5. Both PITR and backups restore to a NEW table (not in-place)");
  console.log("  6. DAX provides microsecond read latency via in-memory caching");
  console.log("  7. DAX is write-through and eventually consistent");
  console.log("  8. Each feature adds cost — use purposefully, not by default");
  console.log("  9. PITR is the cheapest safety net — enable it on all production tables");
  console.log("  10. Cross-region backup copies provide DR without Global Tables");

  console.log("\n── Exercise complete! ──");
  console.log("You've completed all 8 modules of the DynamoDB Playground!\n");

  raw.destroy();
}

run().catch((error) => {
  console.error("Exercise failed:", error);
  process.exit(1);
});
