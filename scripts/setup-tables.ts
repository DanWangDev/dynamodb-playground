/**
 * Creates all playground tables in DynamoDB Local.
 * Each table is created idempotently — safe to run multiple times.
 *
 * Usage: npm run setup
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { env } from "../src/config/env";
import { createDynamoDBClient } from "../src/config/dynamodb";
import { tableBuilder } from "../test/helpers/table-builder";

const PREFIX = env.DDB_TABLE_PREFIX;

async function main(): Promise<void> {
  const { raw } = createDynamoDBClient({
    endpoint: env.DDB_ENDPOINT,
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  });

  console.log("Creating playground tables...\n");

  // Module 01: Books table (simple PK)
  console.log(`  Creating ${PREFIX}books...`);
  await createIfNotExists(raw, `${PREFIX}books`, (b) =>
    b.withPK("isbn", "S"),
  );

  // Module 02 & 03: Orders table (composite key + indexes)
  console.log(`  Creating ${PREFIX}orders...`);
  await createIfNotExists(raw, `${PREFIX}orders`, (b) =>
    b
      .withPK("customerId", "S")
      .withSK("orderDate", "S")
      .withLSI("total-index", "total", "N")
      .withGSI("status-index", "status", "S", "orderDate", "S")
      .withGSI("discount-index", "discountCode", "S"),
  );

  // Module 04: Single-table design (PK + SK overloading)
  console.log(`  Creating ${PREFIX}ecommerce...`);
  await createIfNotExists(raw, `${PREFIX}ecommerce`, (b) =>
    b
      .withPK("pk", "S")
      .withSK("sk", "S")
      .withGSI("gsi1", "gsi1Pk", "S", "gsi1Sk", "S"),
  );

  // Module 05: Sessions table (for TTL demo)
  console.log(`  Creating ${PREFIX}sessions...`);
  await createIfNotExists(raw, `${PREFIX}sessions`, (b) =>
    b.withPK("sessionId", "S"),
  );

  // Module 05: Inventory table (for transactions demo)
  console.log(`  Creating ${PREFIX}inventory...`);
  await createIfNotExists(raw, `${PREFIX}inventory`, (b) =>
    b.withPK("productId", "S"),
  );

  // Module 05: Profiles table (for conditional writes / optimistic locking demo)
  console.log(`  Creating ${PREFIX}profiles...`);
  await createIfNotExists(raw, `${PREFIX}profiles`, (b) =>
    b.withPK("userId", "S"),
  );

  // Module 05: Stats table (for atomic counters demo)
  console.log(`  Creating ${PREFIX}stats...`);
  await createIfNotExists(raw, `${PREFIX}stats`, (b) =>
    b.withPK("articleId", "S"),
  );

  // Module 06: Stream demo table (composite key + DynamoDB Streams enabled)
  console.log(`  Creating ${PREFIX}stream_demo...`);
  await createWithStream(raw, `${PREFIX}stream_demo`, (b) =>
    b
      .withPK("pk", "S")
      .withSK("sk", "S")
      .withStream("NEW_AND_OLD_IMAGES"),
  );

  console.log("\nAll tables created successfully.");
  raw.destroy();
}

async function createIfNotExists(
  client: DynamoDBClient,
  tableName: string,
  configure: (b: ReturnType<typeof tableBuilder>) => ReturnType<typeof tableBuilder>,
): Promise<void> {
  try {
    const builder = tableBuilder(client, tableName);
    await configure(builder).create();
    console.log(`    ✓ Created table: ${tableName}`);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ResourceInUseException"
    ) {
      console.log(`    - Table already exists: ${tableName}`);
      return;
    }
    throw error;
  }
}

/**
 * Create a table with streams enabled. If the table already exists
 * but without streams, enables streams on the existing table.
 */
async function createWithStream(
  client: DynamoDBClient,
  tableName: string,
  configure: (b: ReturnType<typeof tableBuilder>) => ReturnType<typeof tableBuilder>,
): Promise<void> {
  try {
    const builder = tableBuilder(client, tableName);
    await configure(builder).create();
    console.log(`    ✓ Created table with stream: ${tableName}`);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ResourceInUseException"
    ) {
      console.log(`    - Table already exists: ${tableName}`);
      // Try to enable streams on the existing table
      try {
        const builder = tableBuilder(client, tableName);
        await configure(builder).enableStreamOnExisting();
        console.log(`    ✓ Enabled stream on existing table: ${tableName}`);
      } catch (streamError: unknown) {
        // Streams may already be enabled — that's fine
        if (
          streamError instanceof Error &&
          streamError.name === "ResourceInUseException"
        ) {
          console.log(`    - Stream already enabled: ${tableName}`);
        } else {
          throw streamError;
        }
      }
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
