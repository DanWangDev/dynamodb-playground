/**
 * Populates playground tables with sample data for exercises.
 *
 * Usage: npm run seed
 */

import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "../src/config/env";
import { createDynamoDBClient } from "../src/config/dynamodb";
import { generateBooks, generateOrders } from "../test/helpers/seed-helpers";

const PREFIX = env.DDB_TABLE_PREFIX;

async function main(): Promise<void> {
  const { doc } = createDynamoDBClient({
    endpoint: env.DDB_ENDPOINT,
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  });

  console.log("Seeding playground data...\n");

  // Seed books (Module 01)
  const books = generateBooks(10, { prefix: "seed" });
  await batchWrite(doc, `${PREFIX}books`, books);
  console.log(`  ✓ Seeded ${books.length} books`);

  // Seed orders (Module 02/03)
  const orders = generateOrders(3, 5, { prefix: "seed" });
  await batchWrite(doc, `${PREFIX}orders`, orders);
  console.log(`  ✓ Seeded ${orders.length} orders`);

  // Seed ecommerce (Module 04)
  await seedEcommerce(doc);
  console.log(`  ✓ Seeded ecommerce data`);

  // Seed sessions (Module 05 — TTL)
  await seedSessions(doc);
  console.log(`  ✓ Seeded sessions`);

  console.log("\nSeed data loaded successfully.");
  doc.destroy();
}

async function batchWrite(
  doc: ReturnType<typeof createDynamoDBClient>["doc"],
  tableName: string,
  items: Record<string, unknown>[],
): Promise<void> {
  // DynamoDB BatchWrite supports max 25 items per request
  const chunks = chunkArray(items, 25);
  for (const chunk of chunks) {
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({
            PutRequest: { Item: item },
          })),
        },
      }),
    );
  }
}

async function seedEcommerce(
  doc: ReturnType<typeof createDynamoDBClient>["doc"],
): Promise<void> {
  const table = `${PREFIX}ecommerce`;
  const items = [
    // Users
    { pk: "USER#alice", sk: "PROFILE", gsi1Pk: "PROFILE", gsi1Sk: "alice@example.com", name: "Alice", email: "alice@example.com", entityType: "USER" },
    { pk: "USER#bob", sk: "PROFILE", gsi1Pk: "PROFILE", gsi1Sk: "bob@example.com", name: "Bob", email: "bob@example.com", entityType: "USER" },
    // Products
    { pk: "PRODUCT#p1", sk: "DETAILS", gsi1Pk: "PRODUCT", gsi1Sk: "Widget", name: "Widget", price: 9.99, stock: 100, entityType: "PRODUCT" },
    { pk: "PRODUCT#p2", sk: "DETAILS", gsi1Pk: "PRODUCT", gsi1Sk: "Gadget", name: "Gadget", price: 24.99, stock: 50, entityType: "PRODUCT" },
    // Orders
    { pk: "USER#alice", sk: "ORDER#ord1", gsi1Pk: "ORDER", gsi1Sk: "2024-01-15T10:30:00Z", orderDate: "2024-01-15T10:30:00Z", total: 34.98, status: "DELIVERED", entityType: "ORDER" },
    { pk: "USER#alice", sk: "ORDER#ord2", gsi1Pk: "ORDER", gsi1Sk: "2024-02-20T14:00:00Z", orderDate: "2024-02-20T14:00:00Z", total: 24.99, status: "PENDING", entityType: "ORDER" },
    { pk: "USER#bob", sk: "ORDER#ord3", gsi1Pk: "ORDER", gsi1Sk: "2024-03-10T09:15:00Z", orderDate: "2024-03-10T09:15:00Z", total: 9.99, status: "SHIPPED", entityType: "ORDER" },
  ];

  await batchWrite(doc, table, items);
}

async function seedSessions(
  doc: ReturnType<typeof createDynamoDBClient>["doc"],
): Promise<void> {
  const table = `${PREFIX}sessions`;
  const now = Math.floor(Date.now() / 1000);

  const sessions = [
    { sessionId: "active-session", userId: "alice", createdAt: now, ttl: now + 3600 },
    { sessionId: "expiring-session", userId: "bob", createdAt: now - 3600, ttl: now + 60 },
  ];

  await batchWrite(doc, table, sessions);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
