/**
 * Module 02 Exercise: Queries and Scans
 *
 * Run: npm run exercise:queries  (or: npx tsx src/02-queries/exercise.ts)
 *
 * Prerequisites:
 *   1. docker-compose up -d && npm run setup && npm run seed
 */

import { createClientFromEnv } from "../config/dynamodb";
import { env } from "../config/env";
import { createLogger } from "../shared/logger";
import {
  queryOrdersByCustomer,
  queryOrdersByDateRange,
  queryOrdersFromDate,
  queryOrdersByDatePrefix,
  queryOrdersByCustomerAndStatus,
} from "./query-by-key";
import { scanAllOrders, scanOrdersByStatus } from "./scan";
import {
  queryOrdersAboveTotal,
  queryOrdersInStatuses,
} from "./filter-expressions";
import { getOrdersPage, getAllOrdersForCustomer } from "./pagination";

const log = createLogger("02-queries");
const TABLE = `${env.DDB_TABLE_PREFIX}orders`;

async function run(): Promise<void> {
  const { doc } = createClientFromEnv(env);

  log.section("Module 02: Queries and Scans");
  console.log(
    "Domain: Orders table — composite key (customerId + orderDate)\n",
  );

  // ─── Step 1: Query by Partition Key ───────────────────────────
  log.section("Step 1: Query — Fetch All Orders for a Customer");

  log.concept(
    "Query requires an EXACT partition key match.\n" +
      "  • You CANNOT do partial matches or ranges on the partition key.\n" +
      "  • Items with the same PK are stored together, sorted by the sort key.\n" +
      "  • This is the most efficient way to read multiple items.",
  );

  log.step("Querying all orders for 'seed_cust_0'...");
  const customerOrders = await queryOrdersByCustomer(doc, TABLE, "seed_cust_0");
  log.success(`Found ${customerOrders.items.length} orders:`, customerOrders.items);

  // ─── Step 2: Sort Key Conditions ──────────────────────────────
  log.section("Step 2: KeyConditionExpression — Filtering by Sort Key");

  log.concept(
    "Once DynamoDB finds the partition, you can filter by sort key:\n" +
      "  • = : exact match\n" +
      "  • BETWEEN :start AND :end : range (inclusive)\n" +
      "  • >= / > / <= / < : comparison\n" +
      "  • begins_with : prefix match on strings",
  );

  log.step("Querying orders in 2024 Q1 (Jan-Mar)...");
  const q1Orders = await queryOrdersByDateRange(
    doc,
    TABLE,
    "seed_cust_0",
    "2024-01-01T00:00:00Z",
    "2024-03-31T23:59:59Z",
  );
  log.success(`Found ${q1Orders.items.length} orders in Q1`);

  log.step("Querying orders from February onwards (>= comparison)...");
  const febOnwards = await queryOrdersFromDate(
    doc,
    TABLE,
    "seed_cust_0",
    "2024-02-01T00:00:00Z",
  );
  log.success(`Found ${febOnwards.items.length} orders from Feb onwards`);

  log.step("Querying orders with 'begins_with' on orderDate for 2024-01...");
  const janOrders = await queryOrdersByDatePrefix(
    doc,
    TABLE,
    "seed_cust_0",
    "2024-01",
  );
  log.success(`Found ${janOrders.items.length} orders in January`);

  // ─── Step 3: FilterExpression on Query ─────────────────────────
  log.section("Step 3: FilterExpression on Query");

  log.concept(
    "FilterExpression applies AFTER the query reads items from the partition.\n" +
      "  • It does NOT reduce the number of items READ (you still pay RCU for all).\n" +
      "  • It only reduces the number of items RETURNED.\n" +
      "  • For efficient filtering by status, we'd need a GSI (Module 03).",
  );

  log.step("Querying orders for seed_cust_0, filtered to PENDING status...");
  const pendingOrders = await queryOrdersByCustomerAndStatus(
    doc,
    TABLE,
    "seed_cust_0",
    "PENDING",
  );
  log.success(`Found ${pendingOrders.items.length} PENDING orders`);

  // ─── Step 4: Scan — The Full Table Sweep ──────────────────────
  log.section("Step 4: Scan — Reading the Entire Table");

  log.concept(
    "Scan reads EVERY item in the table, then optionally filters.\n" +
      "  • O(n) — very expensive on large tables.\n" +
      "  • FilterExpression doesn't save RCU — you pay for ALL scanned items.\n" +
      "  • Valid uses: exports, analytics, table-wide operations.\n" +
      "  • NEVER use Scan in a user-facing request path.",
  );

  log.step("Scanning ALL orders (watch the ConsumedCapacity)...");
  const allOrders = await scanAllOrders(doc, TABLE);
  log.success(
    `Scanned ${allOrders.items.length} orders (this read the ENTIRE table)`,
  );

  log.step("Scanning for DELIVERED orders only...");
  const deliveredScan = await scanOrdersByStatus(doc, TABLE, "DELIVERED");
  log.warn(
    `Found ${deliveredScan.items.length} DELIVERED orders, but you paid to scan ALL items!`,
  );

  // ─── Step 5: FilterExpression Deep Dive ───────────────────────
  log.section("Step 5: FilterExpression Operators");

  log.concept(
    "FilterExpression supports many operators:\n" +
      "  • =, <>, <, <=, >, >= : comparison\n" +
      "  • BETWEEN :a AND :b : range\n" +
      "  • IN (:a, :b, :c) : value in list\n" +
      "  • attribute_exists(name) / attribute_not_exists(name)\n" +
      "  • begins_with(path, :prefix)\n" +
      "  • contains(path, :value) : substring or set membership",
  );

  log.step("Filter: orders with total > 25...");
  const highValue = await queryOrdersAboveTotal(doc, TABLE, "seed_cust_0", 25);
  log.success(`Found ${highValue.items.length} orders above $25`);

  log.step("Filter: orders with status IN (PENDING, SHIPPED)...");
  const activeOrders = await queryOrdersInStatuses(doc, TABLE, "seed_cust_0", [
    "PENDING",
    "SHIPPED",
  ]);
  log.success(`Found ${activeOrders.items.length} active orders`);

  // ─── Step 6: Pagination ──────────────────────────────────────
  log.section("Step 6: Cursor-Based Pagination");

  log.concept(
    "DynamoDB pagination is cursor-based (not offset-based):\n" +
      "  • No 'page 3 of 10' — you can't skip to page N.\n" +
      "  • Each response may include LastEvaluatedKey — pass it as ExclusiveStartKey.\n" +
      "  • Limit controls items per page; DynamoDB always caps at 1MB.\n" +
      "  • This is called 'forward-only pagination'.",
  );

  log.step("Fetching page 1 (2 items per page)...");
  const page1 = await getOrdersPage(doc, TABLE, "seed_cust_0", 2, undefined);
  log.success(`Page 1: ${page1.items.length} items`, page1.items);
  log.info(`Has more? ${page1.hasMore}`);

  if (page1.hasMore) {
    log.step("Fetching page 2...");
    const page2 = await getOrdersPage(
      doc,
      TABLE,
      "seed_cust_0",
      2,
      page1.lastEvaluatedKey,
    );
    log.success(`Page 2: ${page2.items.length} items`, page2.items);
  }

  log.step("Fetching ALL orders for customer (exhaustive pagination)...");
  const allCustomerOrders = await getAllOrdersForCustomer(
    doc,
    TABLE,
    "seed_cust_0",
  );
  log.success(`Total: ${allCustomerOrders.length} orders across all pages`);

  // ─── Summary ──────────────────────────────────────────────────
  log.section("Summary: What You Learned");
  console.log("  1. Query is the workhorse — exact PK match, optional SK filtering");
  console.log("  2. KeyConditionExpression filters by sort key BEFORE reads are counted");
  console.log("  3. FilterExpression filters AFTER reads — doesn't save RCU on Query either");
  console.log("  4. Scan reads EVERY item — avoid in request paths");
  console.log("  5. Pagination is cursor-based — LastEvaluatedKey → ExclusiveStartKey");
  console.log("  6. begins_with only works on string attributes");

  console.log("\n── Exercise complete! ──");
  console.log("Next: Module 03 — Secondary Indexes (npm run exercise:indexes)\n");

  doc.destroy();
}

run().catch((error) => {
  console.error("Exercise failed:", error);
  process.exit(1);
});
