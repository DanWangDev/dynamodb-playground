/**
 * Module 04 Exercise: Single-Table Design
 *
 * Run: npm run exercise:single-table  (or: npx tsx src/04-single-table/exercise.ts)
 *
 * Prerequisites:
 *   1. docker-compose up -d && npm run setup && npm run seed
 */

import { createClientFromEnv } from "../config/dynamodb";
import { env } from "../config/env";
import { createLogger } from "../shared/logger";
import { inferEntityType, extractId } from "./design";
import {
  createUser,
  createOrder,
  createProduct,
  createReview,
  getUserWithOrders,
  getProductWithReviews,
} from "./key-overloading";
import {
  getAllUsers,
  getAllProducts,
  getAllOrders,
  getAllOrdersByStatus,
  getOrder,
} from "./access-patterns";

const log = createLogger("04-single-table");
const TABLE = `${env.DDB_TABLE_PREFIX}ecommerce`;

async function run(): Promise<void> {
  const { doc } = createClientFromEnv(env);

  log.section("Module 04: Single-Table Design");
  console.log(
    "Domain: E-commerce — Users, Orders, Products, Reviews in ONE table\n",
  );

  // ─── Step 1: The Paradigm Shift ───────────────────────────────
  log.section("Step 1: Why One Table?");

  log.concept(
    "In a relational DB, you'd have: users, orders, products, reviews tables.\n" +
      "In DynamoDB single-table design, everything goes in ONE table:\n\n" +
      "  PK=USER#alice   SK=PROFILE        → user profile\n" +
      "  PK=USER#alice   SK=ORDER#ord1     → alice's order\n" +
      "  PK=PRODUCT#p1   SK=DETAILS        → product details\n" +
      "  PK=PRODUCT#p1   SK=REVIEW#rev1    → review for p1\n\n" +
      "Benefits: one Query gets user + all orders, no JOINs needed.",
  );

  // ─── Step 2: Key Overloading ─────────────────────────────────
  log.section("Step 2: Key Overloading — Multiple Entities, Same Structure");

  log.concept(
    "Every item uses the same key attributes (pk, sk, gsi1Pk, gsi1Sk),\n" +
      "but the VALUES differ based on what entity it is:\n\n" +
      "  User:   pk=USER#<id>   sk=PROFILE       gsi1Pk=PROFILE\n" +
      "  Order:  pk=USER#<id>   sk=ORDER#<id>    gsi1Pk=ORDER\n" +
      "  Product: pk=PRODUCT#<id> sk=DETAILS     gsi1Pk=PRODUCT\n" +
      "  Review: pk=PRODUCT#<id> sk=REVIEW#<id>  gsi1Pk=REVIEW",
  );

  log.step("Creating a user (Alice)...");
  const alice = await createUser(doc, TABLE, "alice", "Alice Johnson", "alice@example.com");
  log.success("User created:", { name: alice.name, pk: alice.pk, sk: alice.sk });

  log.step("Creating products...");
  const widget = await createProduct(doc, TABLE, "p1", "Widget", 9.99, 100, "Electronics");
  await createProduct(doc, TABLE, "p2", "Gadget", 24.99, 50, "Electronics");
  log.success("Products created", { widget: widget.name });

  log.step("Creating orders for Alice...");
  await createOrder(doc, TABLE, "alice", "ord1", "2024-01-15T10:30:00Z", 34.98, "DELIVERED", [
    { productId: "p1", name: "Widget", quantity: 2, price: 9.99 },
    { productId: "p2", name: "Gadget", quantity: 1, price: 24.99 },
  ]);
  await createOrder(doc, TABLE, "alice", "ord2", "2024-02-20T14:00:00Z", 24.99, "PENDING", [
    { productId: "p2", name: "Gadget", quantity: 1, price: 24.99 },
  ]);
  log.success("Orders created");

  log.step("Creating a review...");
  await createReview(doc, TABLE, "alice", "p1", "rev1", 5, "Great little widget!");
  log.success("Review created");

  // ─── Step 3: The Magic — One Query, Multiple Entity Types ─────
  log.section("Step 3: One Query Returns Multiple Entity Types");

  log.concept(
    "Query PK=USER#alice returns EVERYTHING in that partition:\n" +
      "  • The user profile\n" +
      "  • All their orders\n" +
      "  No JOIN needed. One request. O(1) efficiency.",
  );

  log.step("Querying USER#alice partition...");
  const { user, orders } = await getUserWithOrders(doc, TABLE, "alice");
  if (user) {
    log.success(`User: ${user.name} <${user.email}>`);
  }
  log.success(`Orders: ${orders.length}`);
  for (const o of orders) {
    console.log(`     ${o.sk} — $${o.total} — ${o.status}`);
  }

  log.step("Querying PRODUCT#p1 partition (product + reviews)...");
  const { product, reviews } = await getProductWithReviews(doc, TABLE, "p1");
  if (product) {
    log.success(`Product: ${product.name} — $${product.price} (${product.stock} in stock)`);
  }
  log.success(`Reviews: ${reviews.length}`);
  for (const r of reviews) {
    console.log(`     ${r.rating}★ — "${r.comment}" by ${r.userId}`);
  }

  // ─── Step 4: Entity Discrimination ────────────────────────────
  log.section("Step 4: Entity Discrimination — Telling Types Apart");

  log.concept(
    "When a query returns mixed entity types, you need to know what's what.\n" +
      "  • Use the 'entityType' attribute (USER/ORDER/PRODUCT/REVIEW)\n" +
      "  • Filter by type: filterByType(items, 'ORDER')\n" +
      "  • Group by type: groupByType(items) → { USER: [...], ORDER: [...], ... }",
  );

  log.step("Demonstrating type inference from key patterns...");
  log.info(`USER#alice / PROFILE → ${inferEntityType("USER#alice", "PROFILE")}`);
  log.info(`USER#alice / ORDER#ord1 → ${inferEntityType("USER#alice", "ORDER#ord1")}`);
  log.info(`PRODUCT#p1 / DETAILS → ${inferEntityType("PRODUCT#p1", "DETAILS")}`);

  log.step("Extracting IDs from composite keys...");
  log.info(`extractId("USER#alice") → "${extractId("USER#alice")}"`);
  log.info(`extractId("ORDER#ord1") → "${extractId("ORDER#ord1")}"`);

  // ─── Step 5: GSI Overloading ─────────────────────────────────
  log.section("Step 5: GSI Overloading — One GSI, Many Queries");

  log.concept(
    "One GSI serves multiple access patterns through key overloading:\n" +
      "  • Query GSI1 where gsi1Pk='PROFILE' → all users\n" +
      "  • Query GSI1 where gsi1Pk='PRODUCT' → all products\n" +
      "  • Query GSI1 where gsi1Pk='ORDER' → all orders\n" +
      "  Three different query patterns, ONE GSI.",
  );

  log.step("Getting all users via GSI1 (gsi1Pk='PROFILE')...");
  const allUsers = await getAllUsers(doc, TABLE);
  log.success(`Found ${allUsers.items.length} users`);

  log.step("Getting all products via GSI1 (gsi1Pk='PRODUCT')...");
  const allProducts = await getAllProducts(doc, TABLE);
  log.success(`Found ${allProducts.items.length} products`);

  log.step("Getting all orders via GSI1 (gsi1Pk='ORDER')...");
  const allOrders = await getAllOrders(doc, TABLE);
  log.success(`Found ${allOrders.items.length} orders total`);

  log.step("Getting PENDING orders via GSI1 with FilterExpression...");
  const pendingOrders = await getAllOrdersByStatus(doc, TABLE, "PENDING");
  log.success(`Found ${pendingOrders.items.length} PENDING orders`);

  // ─── Step 6: Direct GetItem ──────────────────────────────────
  log.section("Step 6: Direct GetItem — Fetching Single Entities");

  log.concept(
    "Even in a single table, you can directly GetItem a specific entity:\n" +
      "  • GetItem(pk=USER#alice, sk=ORDER#ord1) → just that order\n" +
      "  • GetItem(pk=PRODUCT#p1, sk=DETAILS) → just that product\n" +
      "  No Query needed when you know the exact PK and SK.",
  );

  log.step("Getting a single order by PK + SK...");
  const singleOrder = await getOrder(doc, TABLE, "alice", "ord1");
  if (singleOrder) {
    log.success(`Order: ${singleOrder.sk} — $${singleOrder.total} — ${singleOrder.status}`);
  }

  // ─── Step 7: Adding a New Access Pattern ─────────────────────
  log.section("Step 7: Adding a New Access Pattern Without Schema Changes");

  log.concept(
    "What if marketing wants: 'Show reviews sorted by date'?\n\n" +
      "  In SQL: ALTER TABLE reviews ADD COLUMN... maybe a new index...\n" +
      "  In DynamoDB: Just start writing REVIEW items with gsi1Pk='REVIEW'.\n" +
      "  They automatically appear in a GSI1 Query where gsi1Pk='REVIEW'.\n\n" +
      "  No schema migration needed. No downtime. Just write the data.",
  );

  log.step("Reviews are already queryable via GSI1:");
  log.info("  Query(GSI1, gsi1Pk='REVIEW') → all reviews sorted by createdAt");
  log.info("  This pattern 'just works' because we used GSI overloading!");

  // ─── Summary ──────────────────────────────────────────────────
  log.section("Summary: What You Learned");
  console.log("  1. Single-table design stores multiple entity types in ONE table");
  console.log("  2. Key overloading: same PK/SK structure, different values per entity");
  console.log("  3. One Query can return user + orders + reviews (no JOINs)");
  console.log("  4. Entity discrimination via entityType attribute or PK prefix");
  console.log("  5. GSI overloading: one GSI serves multiple query patterns");
  console.log("  6. Direct GetItem still works for single-entity access");
  console.log("  7. New access patterns can be added without schema changes");
  console.log("\n  Design mantra: Access patterns FIRST, entity model SECOND.");

  console.log("\n── Exercise complete! ──");
  console.log("Next: Module 05 — Advanced Features (npm run exercise:advanced)\n");

  doc.destroy();
}

run().catch((error) => {
  console.error("Exercise failed:", error);
  process.exit(1);
});
