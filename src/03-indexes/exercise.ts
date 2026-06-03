/**
 * Module 03 Exercise: Secondary Indexes
 *
 * Run: npm run exercise:indexes  (or: npx tsx src/03-indexes/exercise.ts)
 *
 * Prerequisites:
 *   1. docker-compose up -d && npm run setup && npm run seed
 *   NOTE: If you ran setup before this module was added, run:
 *         npm run dynamodb:reset && npm run setup && npm run seed
 */

import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { createClientFromEnv } from "../config/dynamodb";
import { env } from "../config/env";
import { createLogger } from "../shared/logger";
import { queryOrdersByTotal, queryMostExpensiveOrders } from "./lsi-queries";
import {
  queryOrdersByStatus,
  queryRecentOrdersByStatus,
  queryHighValueOrdersByStatus,
  findOrdersByStatusWithScan,
} from "./gsi-queries";
import { queryOrdersWithDiscount, shouldUseIndex } from "./index-design";
import { PROJECTION_GUIDE } from "./projections";

const log = createLogger("03-indexes");
const TABLE = `${env.DDB_TABLE_PREFIX}orders`;

async function run(): Promise<void> {
  const { doc } = createClientFromEnv(env);

  log.section("Module 03: Secondary Indexes");
  console.log(
    "Domain: Orders table with LSIs and GSIs\n",
  );

  // ─── Step 1: Index Concepts ──────────────────────────────────
  log.section("Step 1: Why Indexes?");

  log.concept(
    "Without indexes, you can only Query by the table's primary key.\n" +
      "  • 'Find all PENDING orders' → requires a full table Scan (reads EVERY item)\n" +
      "  • 'Sort orders by total' → requires fetching all and sorting in memory\n\n" +
      "Indexes create an ALTERNATIVE key structure for efficient queries.\n" +
      "  • LSI: Same partition key, different sort key (must be created at table time)\n" +
      "  • GSI: Can have completely different partition key (can be added anytime)",
  );

  // ─── Step 2: LSI — Different Sort Key ─────────────────────────
  log.section("Step 2: Local Secondary Index (LSI) — Query by Total");

  log.concept(
    "The Orders table has an LSI: 'total-index'\n" +
      "  • PK: customerId (same as base table)\n" +
      "  • SK: total (instead of orderDate)\n" +
      "  • Supports strongly consistent reads\n" +
      "  • Can only be created when the table is created\n\n" +
      "Now we can query: 'Show me customer X's orders, sorted by price'",
  );

  log.step("Querying orders for seed_cust_0, sorted by total (cheapest first)...");
  const byTotal = await queryOrdersByTotal(doc, TABLE, "seed_cust_0");
  log.success(`Found ${byTotal.items.length} orders sorted by total:`);
  for (const o of byTotal.items) {
    console.log(`     $${o.total} — ${o.orderId}`);
  }

  log.step("Querying most expensive orders (total >= $50, descending)...");
  const expensive = await queryMostExpensiveOrders(doc, TABLE, "seed_cust_0", 50);
  if (expensive.items.length > 0) {
    log.success(`Found ${expensive.items.length} expensive orders:`);
    for (const o of expensive.items) {
      console.log(`     $${o.total} — ${o.orderId}`);
    }
  } else {
    log.info("No orders above $50 for this customer.");
  }

  // ─── Step 3: GSI — Different Partition Key ────────────────────
  log.section("Step 3: Global Secondary Index (GSI) — Cross-Partition Queries");

  log.concept(
    "The Orders table has a GSI: 'status-index'\n" +
      "  • PK: status (completely different from base table's PK!)\n" +
      "  • SK: orderDate\n" +
      "  • Eventually consistent only (no ConsistentRead option)\n" +
      "  • Can be added to an existing table at any time\n" +
      "  • Has its own throughput capacity\n\n" +
      "Now we can query: 'Show me ALL orders that are PENDING, across all customers'",
  );

  log.step("Querying ALL PENDING orders (across all customers)...");
  const pending = await queryOrdersByStatus(doc, TABLE, "PENDING");
  log.success(`Found ${pending.items.length} PENDING orders across all customers`);

  log.step("Getting the 5 most recent SHIPPED orders...");
  const recentShipped = await queryRecentOrdersByStatus(doc, TABLE, "SHIPPED", 5);
  log.success(`Recent SHIPPED orders:`, recentShipped.items);

  log.step("Getting high-value PENDING orders (total > $30)...");
  const highValuePending = await queryHighValueOrdersByStatus(doc, TABLE, "PENDING", 30);
  log.success(
    `Found ${highValuePending.items.length} high-value PENDING orders`,
  );

  // ─── Step 4: GSI vs Scan — The Cost Difference ────────────────
  log.section("Step 4: Index Query vs. Table Scan — Cost Comparison");

  log.concept(
    "WITH GSI: Query reads ONLY items with the matching status.\n" +
      "WITH Scan: Reads EVERY item in the table, then filters.\n\n" +
      "Let's compare the ConsumedCapacity for each approach.",
  );

  log.step("Finding DELIVERED orders with GSI Query...");
  const gsiResult = await queryOrdersByStatus(doc, TABLE, "DELIVERED");
  log.success(
    `GSI Query: ${gsiResult.items.length} orders found (efficient — only reads matching items)`,
  );

  log.step("Finding DELIVERED orders with Scan (watch the cost!)...");
  const scanResult = await findOrdersByStatusWithScan(doc, TABLE, "DELIVERED");
  log.warn(
    `Scan: ${scanResult.items.length} orders found, but you paid to scan ALL items in the table!`,
  );
  log.info(
    "For a table with millions of items, this cost difference is MASSIVE.",
  );

  // ─── Step 5: Sparse Index ────────────────────────────────────
  log.section("Step 5: Sparse Index — Finding Items With Optional Attributes");

  log.concept(
    "A sparse index only contains items that HAVE a certain attribute.\n" +
      "  • Items without the attribute are simply NOT in the index.\n" +
      "  • This is more efficient than Scan + FilterExpression: attribute_exists()\n" +
      "  • Common patterns: discount codes, unprocessed items, active subscriptions",
  );

  log.step("Adding an order WITH a discount code...");
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        customerId: "seed_cust_0",
        orderDate: "2024-06-15T10:00:00Z",
        orderId: "discount_ord_1",
        total: 49.99,
        status: "PENDING",
        items: [{ name: "Widget Pro", quantity: 1, price: 49.99 }],
        discountCode: "SAVE20",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  log.success("Added order with discountCode='SAVE20'");

  log.step("Querying the sparse 'discount-index' for code SAVE20...");
  const discounted = await queryOrdersWithDiscount(doc, TABLE, "SAVE20");
  log.success(`Found ${discounted.items.length} orders with discount code SAVE20`);

  log.info(
    "Orders without a discountCode don't appear in this index at all.\n" +
      "  This is a sparse index — only ~1 out of N orders has a discount code.",
  );

  // ─── Step 6: Projection Types ─────────────────────────────────
  log.section("Step 6: Projection Types — What Data Goes Into the Index?");

  log.concept(
    "When you create an index, you choose which attributes are projected (copied):\n" +
      "  • KEYS_ONLY: Only key attributes — cheapest storage, may need follow-up reads\n" +
      "  • INCLUDE: Keys + specified attributes — balanced approach\n" +
      "  • ALL: Full item copy — most storage, simplest queries",
  );

  for (const [type, info] of Object.entries(PROJECTION_GUIDE)) {
    log.info(`${type}: ${info.description}`);
    log.info(`  Storage: ${info.storageCost}, Query cost: ${info.queryCost}`);
    log.info(`  Best for: ${info.bestFor}\n`);
  }

  // ─── Step 7: When to Use an Index ────────────────────────────
  log.section("Step 7: Decision Guide — Should You Add an Index?");

  log.concept(
    "Indexes aren't free — each GSI adds storage and throughput cost.\n" +
      "  • Frequent queries → index is worth it\n" +
      "  • Rare queries on small tables → Scan may be cheaper\n" +
      "  • Always measure before deciding in production",
  );

  const decision1 = shouldUseIndex(100, 10);
  log.info(
    `100 queries/sec, 10GB table: ${decision1.useIndex ? "USE INDEX" : "SCAN"} — ${decision1.reasoning}`,
  );

  const decision2 = shouldUseIndex(0.01, 0.05);
  log.info(
    `1 query/hour, 50MB table: ${decision2.useIndex ? "USE INDEX" : "SCAN"} — ${decision2.reasoning}`,
  );

  // ─── Summary ──────────────────────────────────────────────────
  log.section("Summary: What You Learned");
  console.log("  1. LSIs share the PK, give you a different sort key, support strong consistency");
  console.log("  2. GSIs can have a completely different PK — enables cross-partition queries");
  console.log("  3. GSIs are eventually consistent — no ConsistentRead on GSI queries");
  console.log("  4. Sparse indexes only contain items with the indexed attribute");
  console.log("  5. Index queries are MUCH cheaper than table scans for targeted queries");
  console.log("  6. Choose projection type based on your query patterns (storage vs convenience)");
  console.log("  7. Not every query pattern needs an index — rare queries on small tables may use Scan");

  console.log("\n── Exercise complete! ──");
  console.log("Next: Module 04 — Single-Table Design (npm run exercise:single-table)\n");

  doc.destroy();
}

run().catch((error) => {
  console.error("Exercise failed:", error);
  process.exit(1);
});
