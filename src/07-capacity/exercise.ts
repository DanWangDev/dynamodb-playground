/**
 * Module 07 Exercise: Capacity & Cost Model
 *
 * Run: npm run exercise:capacity  (or: npx tsx src/07-capacity/exercise.ts)
 */

import { createClientFromEnv } from "../config/dynamodb";
import { env } from "../config/env";
import { createLogger } from "../shared/logger";
import {
  rcuPerRead,
  wcuPerWrite,
  rcuForReadThroughput,
  wcuForWriteThroughput,
  estimateProvisionedMonthlyCost,
  estimateOnDemandMonthlyCost,
  compareCapacityModes,
  provisionedBreakEven,
  formatCurrency,
  formatCapacityBreakdown,
} from "./calculator";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const log = createLogger("07-capacity");
const BOOKS_TABLE = `${env.DDB_TABLE_PREFIX}books`;
const ORDERS_TABLE = `${env.DDB_TABLE_PREFIX}orders`;

async function run(): Promise<void> {
  const { doc } = createClientFromEnv(env);

  log.section("Module 07: Capacity & Cost Model");
  console.log(
    "Understanding how DynamoDB consumes capacity — and what it costs.\n",
  );

  // ─── Step 1: Capacity Fundamentals ────────────────────────────
  log.section("Step 1: Capacity Fundamentals — RCU and WCU");

  log.concept(
    "Read Capacity Units (RCU):\n" +
      "  • 1 RCU = 1 strongly consistent read of up to 4KB per second\n" +
      "  • 1 RCU = 2 eventually consistent reads of up to 4KB per second\n" +
      "  • Rounding: ceil(itemSizeKB / 4KB) per read\n\n" +
      "Write Capacity Units (WCU):\n" +
      "  • 1 WCU = 1 standard write of up to 1KB per second\n" +
      "  • Transactional writes cost 2x WCU\n" +
      "  • Rounding: ceil(itemSizeKB / 1KB) per write\n\n" +
      "Key insight: a 4.1KB item costs 2 RCU to read — always rounds UP.",
  );

  console.log("Quick reference:");
  console.log(`  1KB item, eventual read:   ${rcuPerRead(1, false)} RCU`);
  console.log(`  1KB item, consistent read:  ${rcuPerRead(1, true)} RCU`);
  console.log(`  5KB item, eventual read:   ${rcuPerRead(5, false)} RCU`);
  console.log(`  5KB item, consistent read:  ${rcuPerRead(5, true)} RCU`);
  console.log(`  0.5KB write:               ${wcuPerWrite(0.5)} WCU`);
  console.log(`  3KB write:                 ${wcuPerWrite(3)} WCU`);
  console.log(`  10KB write:                ${wcuPerWrite(10)} WCU`);

  // ─── Step 2: Read Consumed Capacity ───────────────────────────
  log.section("Step 2: Read Consumed Capacity — See It in Action");

  log.concept(
    "Every DynamoDB API response can include ConsumedCapacity.\n" +
      "This tells you exactly how many RCU/WCU the operation used.\n" +
      "Reading a large item vs a small item = different capacity cost.",
  );

  log.step("Reading a single book (GetItem) with consumed capacity...");
  try {
    const result = await doc.send(
      new GetCommand({
        TableName: BOOKS_TABLE,
        Key: { isbn: "978-1999000000" },
        ReturnConsumedCapacity: "TOTAL",
        ConsistentRead: true,
      }),
    );

    if (result.Item) {
      const itemSize = JSON.stringify(result.Item).length;
      const approxKB = (itemSize / 1024).toFixed(2);
      log.success(
        `Read 1 item (${itemSize} bytes ≈ ${approxKB}KB) using ${result.ConsumedCapacity?.CapacityUnits} RCU (strongly consistent)`,
      );
      log.info(
        `Expected RCU: ${rcuPerRead(parseFloat(approxKB), true)} (ceil(${approxKB}KB / 4KB))`,
      );
    } else {
      log.warn("Item not found — has the table been seeded? Run: npm run seed");
    }
  } catch (error) {
    log.warn(`Couldn't read item (table may be empty): ${error instanceof Error ? error.message : error}`);
  }

  log.step("Querying orders with consumed capacity...");
  try {
    const queryResult = await doc.send(
      new QueryCommand({
        TableName: ORDERS_TABLE,
        KeyConditionExpression: "customerId = :cid",
        ExpressionAttributeValues: { ":cid": "seed_cust_0" },
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    log.success(
      `Query returned ${queryResult.Items?.length ?? 0} items using ${queryResult.ConsumedCapacity?.CapacityUnits} RCU`,
    );
    log.info(
      "Notice: Query capacity is based on total data read, not number of items returned.",
    );
  } catch (error) {
    log.warn(`Couldn't query orders: ${error instanceof Error ? error.message : error}`);
    log.info("Make sure tables are created and seeded: npm run setup && npm run seed");
  }

  log.step("Scanning books with consumed capacity...");
  try {
    const scanResult = await doc.send(
      new ScanCommand({
        TableName: BOOKS_TABLE,
        Limit: 1,
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    log.success(
      `Scan (1 item) used ${scanResult.ConsumedCapacity?.CapacityUnits} RCU`,
    );
    log.info(
      "A Scan that reads 1MB of data consumes at minimum ceil(1MB / 4KB) = 256 RCU.",
    );
  } catch (error) {
    log.warn(`Couldn't scan books: ${error instanceof Error ? error.message : error}`);
  }

  // ─── Step 3: Calculating Provisioned Capacity ─────────────────
  log.section("Step 3: Calculating Provisioned Capacity for Your Workload");

  log.concept(
    "The formula for provisioned capacity:\n\n" +
      "  RCU = reads_per_second × ceil(avg_item_KB / 4) × consistency_factor\n" +
      "  WCU = writes_per_second × ceil(avg_item_KB / 1)\n\n" +
      "Always include a safety margin (20-30%) for traffic variance.",
  );

  const scenario = {
    readsPerSecond: 50,
    writesPerSecond: 10,
    avgItemSizeKB: 2,
  };

  console.log(formatCapacityBreakdown(scenario));
  console.log(`\n  With 20% safety margin: ${Math.ceil(rcuForReadThroughput(scenario.readsPerSecond, scenario.avgItemSizeKB) * 1.2)} RCU + ${Math.ceil(wcuForWriteThroughput(scenario.writesPerSecond, scenario.avgItemSizeKB) * 1.2)} WCU\n`);

  // ─── Step 4: On-Demand vs Provisioned ─────────────────────────
  log.section("Step 4: On-Demand vs Provisioned — Cost Comparison");

  log.concept(
    "Provisioned: pay per capacity unit per hour (best for steady workloads)\n" +
      "On-demand: pay per request (best for variable/spiky workloads)\n\n" +
      "The break-even analysis helps you decide which model saves money.",
  );

  const modes = compareCapacityModes({
    readsPerSecond: 100,
    writesPerSecond: 50,
    avgItemSizeKB: 2,
    storageGB: 100,
  });

  console.log("Workload: 100 reads/s + 50 writes/s, 2KB items, 100GB storage\n");
  console.log(`  Provisioned: ${formatCurrency(modes.provisioned.total)}/month`);
  console.log(`  On-demand:   ${formatCurrency(modes.onDemand.total)}/month`);
  console.log(`  → ${modes.recommendation}`);
  console.log(`  → Savings: ${formatCurrency(modes.savings)}/month`);

  log.step("Break-even analysis: at what throughput does each model become cheaper?");

  const writeBreakEven = provisionedBreakEven({
    avgItemSizeKB: 1,
    operation: "write",
  });
  const readBreakEven = provisionedBreakEven({
    avgItemSizeKB: 4,
    operation: "read",
    consistentRead: false,
  });

  console.log(`  Write break-even: ${writeBreakEven} writes/second (above this, provisioned is cheaper for 1KB items)`);
  console.log(`  Read break-even:  ${readBreakEven} reads/second (above this, provisioned is cheaper for 4KB eventually-consistent items)`);

  // ─── Step 5: Cost Estimation ──────────────────────────────────
  log.section("Step 5: Cost Estimation — Real-World Scenarios");

  log.concept(
    "Real applications have multiple tables with different access patterns.\n" +
      "Estimate each table's capacity separately, then sum the costs.",
  );

  log.step("Scenario A: Small production app (provisioned)");
  const scenarioA = estimateProvisionedMonthlyCost({
    readCapacityUnits: 200,
    writeCapacityUnits: 100,
    storageGB: 25,
    backupGB: 25,
  });

  console.log(`  Reads:  ${formatCurrency(scenarioA.readCost)}/month`);
  console.log(`  Writes: ${formatCurrency(scenarioA.writeCost)}/month`);
  console.log(`  Storage: ${formatCurrency(scenarioA.storageCost)}/month`);
  console.log(`  Backups: ${formatCurrency(scenarioA.backupCost)}/month`);
  console.log(`  Total:   ${formatCurrency(scenarioA.total)}/month`);
  console.log(`  (Within free tier: 25GB storage + 25 RCU/WCU = ~$0/month)`);

  log.step("Scenario B: High-traffic API (on-demand)");
  const scenarioB = estimateOnDemandMonthlyCost({
    readsPerMonth: 500_000_000, // 500M reads/month (~193 reads/s)
    writesPerMonth: 50_000_000, // 50M writes/month (~19 writes/s)
    avgReadSizeKB: 2,
    avgWriteSizeKB: 1,
    storageGB: 200,
  });

  console.log(`  Reads:   ${formatCurrency(scenarioB.readCost)}/month`);
  console.log(`  Writes:  ${formatCurrency(scenarioB.writeCost)}/month`);
  console.log(`  Storage: ${formatCurrency(scenarioB.storageCost)}/month`);
  console.log(`  Total:   ${formatCurrency(scenarioB.total)}/month`);

  log.step("Scenario C: Spiky serverless workload");
  const scenarioC = compareCapacityModes({
    readsPerSecond: 5, // low baseline
    writesPerSecond: 1,
    avgItemSizeKB: 1,
    storageGB: 5,
  });

  console.log(`  Provisioned: ${formatCurrency(scenarioC.provisioned.total)}/month`);
  console.log(`  On-demand:   ${formatCurrency(scenarioC.onDemand.total)}/month`);
  console.log(`  → ${scenarioC.recommendation}`);

  // ─── Step 6: Monitoring & Alarms ──────────────────────────────
  log.section("Step 6: Monitoring & Alarms — Staying Under Budget");

  log.concept(
    "CloudWatch metrics to watch:\n" +
      "  • ConsumedReadCapacityUnits / ConsumedWriteCapacityUnits\n" +
      "  • ThrottledRequests — spikes here mean you need more capacity\n" +
      "  • AccountProvisionedReadCapacityUtilization — account-level view\n\n" +
      "Auto-scaling target: 70% utilisation. This balances headroom with cost.\n" +
      "Set alarms: ThrottledRequests > 0 for 5 min → investigate or scale up.\n\n" +
      "Billing alarm: set a monthly budget alarm to catch unexpected cost spikes.",
  );

  console.log("Recommended CloudWatch Alarms:");
  console.log("  1. ConsumedReadCapacityUnits > 80% provisioned for 15 min");
  console.log("  2. ConsumedWriteCapacityUnits > 80% provisioned for 15 min");
  console.log("  3. ThrottledRequests > 0 for 5 min");
  console.log("  4. Monthly billing alarm at your budget limit");
  console.log("");

  // ─── Summary ──────────────────────────────────────────────────
  log.section("Summary: What You Learned");
  console.log("  1. RCU = reads of 4KB chunks; WCU = writes of 1KB chunks");
  console.log("  2. Items larger than the base unit consume multiple capacity units");
  console.log("  3. Strongly consistent reads cost 2x eventual reads");
  console.log("  4. Provisioned = predictable costs, steady workloads");
  console.log("  5. On-demand = automatic scaling, spiky workloads");
  console.log("  6. The break-even point depends on your throughput pattern");
  console.log("  7. Free tier: 25GB storage + 25 RCU/WCU per month, forever");
  console.log("  8. Set CloudWatch alarms BEFORE you get surprised by a bill");

  console.log("\n── Exercise complete! ──");
  console.log(
    "For more detail, see src/07-capacity/concept.md and the AWS Pricing Calculator.\n",
  );

  doc.destroy();
}

run().catch((error) => {
  console.error("Exercise failed:", error);
  process.exit(1);
});
