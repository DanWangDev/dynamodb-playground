/**
 * Module 05 Exercise: Advanced Features
 *
 * Run: npm run exercise:advanced  (or: npx tsx src/05-advanced/exercise.ts)
 *
 * Prerequisites:
 *   1. docker-compose up -d && npm run setup && npm run seed
 */

import { createClientFromEnv } from "../config/dynamodb";
import { env } from "../config/env";
import { createLogger } from "../shared/logger";
import { createOrderAndDeductInventory } from "./transactions";
import { batchWriteWithRetry } from "./batch-operations";
import { createExpiringSession, getSession, getTtlDesignPatterns } from "./ttl";
import {
  createUserProfile,
  updateUserProfileOptimistic,
  updateWithRetry,
} from "./conditional-writes";
import {
  incrementViews,
  likeArticle,
  getArticleStats,
  explainAtomicCounter,
} from "./atomic-counters";

const log = createLogger("05-advanced");
const ORDER_TABLE = `${env.DDB_TABLE_PREFIX}orders`;
const SESSION_TABLE = `${env.DDB_TABLE_PREFIX}sessions`;
const ECOM_TABLE = `${env.DDB_TABLE_PREFIX}ecommerce`;

async function run(): Promise<void> {
  const { doc } = createClientFromEnv(env);

  log.section("Module 05: Advanced DynamoDB Features");
  console.log(
    "Covering: Transactions, Batch Ops, Streams, TTL, Conditional Writes, Atomic Counters\n",
  );

  // ─── Step 1: Transactions ────────────────────────────────────
  log.section("Step 1: Transactions — Atomic Multi-Item Operations");

  log.concept(
    "TransactWriteItems: all-or-nothing writes across items/tables.\n" +
      "  • Up to 100 items per transaction\n" +
      "  • ALL succeed or ALL fail — no partial writes\n" +
      "  • Costs 2x normal writes (you pay for the atomicity guarantee)\n" +
      "  • Use for: order + payment + inventory updates that must be atomic",
  );

  log.step("Creating order AND deducting inventory atomically...");
  try {
    await createOrderAndDeductInventory(
      doc,
      ORDER_TABLE,
      `${env.DDB_TABLE_PREFIX}books`, // reusing books as inventory
      {
        pk: "cust_adv_1",
        sk: "ORDER#txn_1",
        orderId: "txn_1",
        total: 59.98,
        items: [
          { productId: "978-1999000002", quantity: 1 },
        ],
      },
    );
    log.success("Transaction succeeded — order created AND inventory deducted");
  } catch (error) {
    log.warn(
      `Transaction failed (expected if product doesn't exist): ${error instanceof Error ? error.message : error}`,
    );
  }

  // ─── Step 2: Batch Operations ────────────────────────────────
  log.section("Step 2: Batch Operations — Efficient Bulk Reads/Writes");

  log.concept(
    "BatchWriteItem: write up to 25 items per request.\n" +
      "  • NOT atomic — some items may succeed while others fail\n" +
      "  • Check UnprocessedItems and retry with backoff\n" +
      "  • Use for: bulk imports, data migration\n\n" +
      "BatchGetItem: read up to 100 items across tables.\n" +
      "  • Reads from multiple partitions in parallel",
  );

  log.step("Batch-writing 30 products (will be chunked into 25 + 5)...");
  const products = Array.from({ length: 30 }, (_, i) => ({
    isbn: `bulk_prod_${i}`,
    name: `Bulk Product ${i}`,
    price: (i + 1) * 1.99,
    stock: 100,
  }));

  const batchResult = await batchWriteWithRetry(
    doc,
    `${env.DDB_TABLE_PREFIX}books`, // reusing for demo
    products,
  );
  log.success(
    `Batch write: ${batchResult.written} written, ${batchResult.unprocessed} unprocessed`,
  );
  log.info(
    "(Items chunked into groups of 25 — the DynamoDB limit per BatchWrite)",
  );

  // ─── Step 3: TTL — Time To Live ──────────────────────────────
  log.section("Step 3: TTL — Automatic Item Expiration");

  log.concept(
    "TTL automatically deletes items after a specified timestamp.\n" +
      "  • Attribute value is epoch SECONDS (not milliseconds!)\n" +
      "  • Deletion is BEST-EFFORT — items may persist up to 48 hours\n" +
      "  • No extra cost for TTL deletes\n" +
      "  • TTL deletes appear in DynamoDB Streams (if enabled)",
  );

  log.step("Creating a session that expires in 60 seconds...");
  const session = await createExpiringSession(
    doc,
    SESSION_TABLE,
    "demo-session",
    "alice",
    { cart: ["p1", "p2"], lastPage: "/checkout" },
    60,
  );
  log.success("Session created!", {
    sessionId: session.sessionId,
    ttl: session.ttl,
    ttlDate: new Date(session.ttl * 1000).toISOString(),
  });

  log.step("Checking if session exists now...");
  const found = await getSession(doc, SESSION_TABLE, "demo-session");
  log.success(found ? "Session exists (won't expire for ~60 seconds)" : "Session already expired!");

  log.step("Creating an already-expired session (TTL in the past)...");
  const expiredSession = await createExpiringSession(
    doc,
    SESSION_TABLE,
    "expired-session",
    "bob",
    { cart: [] },
    -1, // TTL in the past — will be deleted soon
  );
  log.info(
    `Created with TTL=${expiredSession.ttl} (${new Date(expiredSession.ttl * 1000).toISOString()}). DynamoDB will delete this soon.`,
  );

  log.section("TTL Design Patterns:");
  for (const pattern of getTtlDesignPatterns()) {
    console.log(`  ${pattern.name}: ${pattern.ttlValue}s — ${pattern.description}`);
  }

  // ─── Step 4: Conditional Writes & Optimistic Locking ──────────
  log.section("Step 4: Conditional Writes & Optimistic Locking");

  log.concept(
    "Optimistic locking prevents lost updates in concurrent environments:\n" +
      "  1. Read item → note the version number\n" +
      "  2. Update: 'SET ... version = N+1 WHERE version = N'\n" +
      "  3. If condition fails → someone else updated first → re-read & retry",
  );

  log.step("Creating a user profile (version starts at 0)...");
  const profile = await createUserProfile(
    doc,
    ECOM_TABLE,
    "user_adv_1",
    "Alice Advanced",
    "alice@advanced.com",
  );
  log.success("Profile created", { version: profile.version });

  log.step("Updating with correct version (0 → should succeed)...");
  const updated = await updateUserProfileOptimistic(
    doc,
    ECOM_TABLE,
    "user_adv_1",
    "Alice Updated",
    "alice-new@advanced.com",
    0,
  );
  log.success("Update succeeded!", { version: updated.version });

  log.step("Updating with WRONG version (0 → should FAIL — current is 1)...");
  try {
    await updateUserProfileOptimistic(
      doc,
      ECOM_TABLE,
      "user_adv_1",
      "Alice Conflicting",
      "alice-conflict@advanced.com",
      0, // wrong version!
    );
  } catch (error) {
    log.warn(
      `Optimistic lock correctly failed: ${error instanceof Error ? error.message : error}`,
    );
  }

  log.step("Updating with automatic retry loop...");
  const finalProfile = await updateWithRetry(
    doc,
    ECOM_TABLE,
    "user_adv_1",
    "Alice Retried",
    "alice-final@advanced.com",
  );
  log.success("Update succeeded after retry!", { version: finalProfile.version });

  // ─── Step 5: Atomic Counters ─────────────────────────────────
  log.section("Step 5: Atomic Counters — Race-Condition-Free Increments");

  log.concept(
    "ADD expression increments a number atomically:\n" +
      "  • No read-before-write needed\n" +
      "  • DynamoDB guarantees the increment happens in isolation\n" +
      "  • GET → increment → PUT would be a race condition!",
  );

  console.log(explainAtomicCounter());

  log.step("Incrementing views on an article...");
  let views = await incrementViews(doc, ECOM_TABLE, "article_1");
  log.success(`Views: ${views}`);

  views = await incrementViews(doc, ECOM_TABLE, "article_1", 5);
  log.success(`Views after +5: ${views}`);

  log.step("Liking an article...");
  const likes = await likeArticle(doc, ECOM_TABLE, "article_1");
  log.success(`Likes: ${likes}`);

  log.step("Simulating concurrent increments (3 at once)...");
  await Promise.all([
    incrementViews(doc, ECOM_TABLE, "article_2"),
    incrementViews(doc, ECOM_TABLE, "article_2"),
    incrementViews(doc, ECOM_TABLE, "article_2"),
  ]);
  log.success("Concurrent increments completed. Final count should be 3");

  const stats = await getArticleStats(doc, ECOM_TABLE, "article_2");
  log.success(`Final: views=${stats?.views ?? "?"}, likes=${stats?.likes ?? "?"}`);

  // ─── Summary ──────────────────────────────────────────────────
  log.section("Summary: What You Learned");
  console.log("  1. Transactions: all-or-nothing multi-item writes (2x cost)");
  console.log("  2. Batch operations: efficient bulk reads/writes (not atomic, retry needed)");
  console.log("  3. TTL: automatic item expiration (best-effort, up to 48hr delay)");
  console.log("  4. Optimistic locking: version numbers prevent lost updates");
  console.log("  5. Conditional writes: ConditionExpression enforces business rules");
  console.log("  6. Atomic counters: ADD expression for race-condition-free increments");

  console.log("\n── Exercise complete! ──");
  console.log("You've completed the DynamoDB Playground!");
  console.log("Review the concept.md files for each module to solidify your understanding.");
  console.log("Try modifying the exercise files to experiment further.\n");

  doc.destroy();
}

run().catch((error) => {
  console.error("Exercise failed:", error);
  process.exit(1);
});
