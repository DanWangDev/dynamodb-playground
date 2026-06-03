/**
 * Module 01 Exercise: Core CRUD Operations
 *
 * Run: npm run exercise:crud  (or: npx tsx src/01-crud/exercise.ts)
 *
 * This script walks you through each CRUD concept step by step.
 * Each step explains the concept, executes the operation,
 * and shows you the result. Read the output and the source code together.
 *
 * Prerequisites:
 *   1. docker-compose up -d   (start DynamoDB Local)
 *   2. npm run setup          (create tables)
 */

import { createClientFromEnv } from "../config/dynamodb";
import { env } from "../config/env";
import { createLogger } from "../shared/logger";
import { createBook, putBook } from "./create-item";
import { getBook } from "./read-item";
import { updateBook, addBookTag, removeBookAttribute } from "./update-item";
import { deleteBook } from "./delete-item";

const log = createLogger("01-crud");
const TABLE = `${env.DDB_TABLE_PREFIX}books`;

async function run(): Promise<void> {
  const { doc } = createClientFromEnv(env);

  log.section("Module 01: Core CRUD Operations");
  console.log(
    "Domain: Books table — simple primary key (ISBN only)\n",
  );
  console.log(
    "You will: Create → Read → Update → Delete a book, learning each operation.\n",
  );

  // ─── Step 1: Create (PutItem) ──────────────────────────────────
  log.section("Step 1: PutItem — Creating an Item");

  log.concept(
    "PutItem creates a new item or fully replaces an existing one (it's an UPSERT).\n" +
      "  • The only required field is the primary key (isbn).\n" +
      "  • We use ConditionExpression: 'attribute_not_exists(isbn)' to prevent overwrites.\n" +
      "  • If the ISBN already exists, DynamoDB throws ConditionalCheckFailedException.",
  );

  log.step("Creating 'The DynamoDB Book'...");
  const book1 = await createBook(doc, TABLE, {
    isbn: "978-1999000001",
    title: "The DynamoDB Book",
    author: "Alex DeBrie",
    pageCount: 500,
    tags: ["dynamodb", "nosql", "aws"],
    rating: 5,
    published: "2024-01-15T00:00:00Z",
  });
  log.success("Book created!", book1);

  log.step("Trying to create the same ISBN again (should fail)...");
  try {
    await createBook(doc, TABLE, {
      isbn: "978-1999000001",
      title: "Duplicate Book",
      author: "Nobody",
    });
  } catch (error) {
    log.warn(
      `Correctly rejected! ${error instanceof Error ? error.message : error}`,
    );
  }

  // ─── Step 2: Read (GetItem) ────────────────────────────────────
  log.section("Step 2: GetItem — Reading an Item");

  log.concept(
    "GetItem fetches ONE item by its exact primary key.\n" +
      "  • Eventually consistent reads (default): faster, cheaper, may return stale data.\n" +
      "  • Strongly consistent reads: always returns latest write, costs 2x RCU.\n" +
      "  • ProjectionExpression: ask only for specific attributes to save bandwidth.",
  );

  log.step("Reading book with eventually consistent read (default)...");
  const read1 = await getBook(doc, TABLE, "978-1999000001");
  log.success("Book found!", { title: read1.title, author: read1.author });

  log.step("Reading with ProjectionExpression (title and rating only)...");
  const read2 = await getBook(doc, TABLE, "978-1999000001", {
    projection: ["title", "rating"],
  });
  log.success("Projected read — only requested attributes returned:", read2);

  log.step("Reading a non-existent book...");
  try {
    await getBook(doc, TABLE, "978-0000000000");
  } catch (error) {
    log.warn(
      `Correctly threw ItemNotFoundError: ${error instanceof Error ? error.message : error}`,
    );
  }

  // ─── Step 3: Update (UpdateItem) ───────────────────────────────
  log.section("Step 3: UpdateItem — Modifying an Item");

  log.concept(
    "UpdateItem modifies ONLY the attributes you specify — unlike PutItem which replaces everything.\n" +
      "  • SET: set/replace an attribute value\n" +
      "  • REMOVE: delete an attribute entirely\n" +
      "  • ADD: add to a number or set\n" +
      "  • ExpressionAttributeNames (#name): avoid reserved word conflicts\n" +
      "  • ExpressionAttributeValues (:val): safe value injection",
  );

  log.step("Updating pageCount and rating...");
  const updated = await updateBook(doc, TABLE, {
    isbn: "978-1999000001",
    pageCount: 520,
    rating: 4,
  });
  log.success("Book updated!", {
    pageCount: updated.pageCount,
    rating: updated.rating,
    updatedAt: updated.updatedAt,
  });

  log.step("Adding a tag with ADD expression...");
  const withTag = await addBookTag(
    doc,
    TABLE,
    "978-1999000001",
    "single-table-design",
  );
  log.success("Tag added!", { tags: withTag.tags });

  log.step("Removing the 'published' attribute with REMOVE...");
  await removeBookAttribute(doc, TABLE, "978-1999000001", "published");
  log.success("Attribute removed — 'published' is gone!");

  // ─── Step 4: PutItem (full replacement) ────────────────────────
  log.section("Step 4: PutItem — Full Replacement (UPSERT)");

  log.concept(
    "WARNING: PutItem WITHOUT ConditionExpression REPLACES the entire item!\n" +
      "  • If you PutItem with only {isbn, title}, you will LOSE author, tags, rating, etc.\n" +
      "  • This is the #1 DynamoDB gotcha for beginners.",
  );

  log.step("Creating a new book that we'll overwrite...");
  await putBook(doc, TABLE, {
    isbn: "978-1999000002",
    title: "Before Overwrite",
    author: "Original Author",
    rating: 3,
    tags: ["original"],
  });
  log.success("Second book created.");

  log.step("OVERWRITING with PutItem (only isbn + title — will lose other fields)...");
  await putBook(doc, TABLE, {
    isbn: "978-1999000002",
    title: "After Overwrite",
    author: "New Author",
  });
  const afterOverwrite = await getBook(doc, TABLE, "978-1999000002");
  log.warn("Notice: tags, rating, pageCount are GONE!", afterOverwrite);

  // ─── Step 5: Delete (DeleteItem) ───────────────────────────────
  log.section("Step 5: DeleteItem — Removing an Item");

  log.concept(
    "DeleteItem removes an item by its primary key.\n" +
      "  • Without ConditionExpression: succeeds even if the item doesn't exist (idempotent).\n" +
      "  • With ConditionExpression: fails if condition not met — prevents accidental deletion.\n" +
      "  • ReturnValues: ALL_OLD returns the item as it was before deletion.",
  );

  log.step("Deleting with a condition (rating must be < 5)...");
  try {
    // This will fail because the original book has rating=4 (and we can't check the overwritten one)
    const deleted = await deleteBook(doc, TABLE, "978-1999000002", {
      conditionExpression: "#rating > :minRating",
      conditionNames: { "#rating": "rating" },
      conditionValues: { ":minRating": 2 },
    });
    log.success("Book deleted!", deleted);
  } catch (error) {
    log.warn(
      `Conditional delete failed: ${error instanceof Error ? error.message : error}`,
    );
  }

  log.step("Deleting the first book unconditionally...");
  const deleted = await deleteBook(doc, TABLE, "978-1999000001");
  log.success("Book deleted! Returned the item as it was before deletion:", deleted);

  // ─── Summary ──────────────────────────────────────────────────
  log.section("Summary: What You Learned");
  console.log("  1. PutItem is an UPSERT — always use ConditionExpression to prevent overwrites");
  console.log("  2. GetItem fetches by exact key — use ProjectionExpression to save bandwidth");
  console.log("  3. UpdateItem modifies specific fields — safer than PutItem for partial updates");
  console.log("  4. DeleteItem can be guarded with conditions to prevent accidents");
  console.log("  5. PutItem without a condition DESTROYS existing attributes");
  console.log("  6. Eventually consistent reads are default — ask for ConsistentRead if needed");

  console.log("\n── Exercise complete! ──");
  console.log("Try modifying this file to experiment with different operations.");
  console.log("Next: Module 02 — Queries & Scans (npm run exercise:queries)\n");

  doc.destroy();
}

run().catch((error) => {
  console.error("Exercise failed:", error);
  process.exit(1);
});
