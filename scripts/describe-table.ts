/**
 * Table schema inspector.
 *
 * Usage:
 *   npm run db:describe              list all tables with key schemas
 *   npm run db:describe <table>      detailed info for one table
 */

import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { createClientFromEnv } from "../src/config/dynamodb";
import { env } from "../src/config/env";

const PREFIX = env.DDB_TABLE_PREFIX;
const KNOWN_TABLES = [
  "books", "orders", "ecommerce", "sessions",
  "inventory", "profiles", "stats", "stream_demo",
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { raw } = createClientFromEnv(env);

  if (args.length > 0) {
    const tableName = args[0].startsWith(PREFIX) ? args[0] : `${PREFIX}${args[0]}`;
    await describeOne(raw, tableName);
  } else {
    await describeAll(raw);
  }

  raw.destroy();
}

async function describeOne(
  raw: ReturnType<typeof createClientFromEnv>["raw"],
  tableName: string,
): Promise<void> {
  try {
    const result = await raw.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    const table = result.Table;
    if (!table) {
      console.log(`Table "${tableName}" not found.`);
      return;
    }

    printDetailed(table);
  } catch (error) {
    console.log(
      `Table "${tableName}" not found or not accessible.`,
    );
  }
}

async function describeAll(
  raw: ReturnType<typeof createClientFromEnv>["raw"],
): Promise<void> {
  console.log("\n📊 DynamoDB Playground — Table Overview\n");
  console.log(
    `${"Table".padEnd(28)} ${"PK".padEnd(18)} ${"SK".padEnd(18)} ${"Items".padStart(8)} ${"Size".padStart(10)} ${"Indexes".padStart(8)} ${"Stream".padStart(6)}`,
  );
  console.log("─".repeat(100));

  for (const name of KNOWN_TABLES) {
    const tableName = `${PREFIX}${name}`;
    try {
      const result = await raw.send(
        new DescribeTableCommand({ TableName: tableName }),
      );
      const table = result.Table;
      if (!table) continue;

      const pk = table.KeySchema?.find((k: any) => k.KeyType === "HASH");
      const sk = table.KeySchema?.find((k: any) => k.KeyType === "RANGE");
      const gsiCount = (table.GlobalSecondaryIndexes ?? []).length;
      const lsiCount = (table.LocalSecondaryIndexes ?? []).length;
      const idxStr = gsiCount + lsiCount > 0 ? `${gsiCount}G${lsiCount > 0 ? `+${lsiCount}L` : ""}` : "—";
      const hasStream = table.LatestStreamArn ? "✓" : "—";

      console.log(
        `${tableName.padEnd(28)} ${(pk?.AttributeName ?? "?").padEnd(18)} ${(sk?.AttributeName ?? "—").padEnd(18)} ${String(table.ItemCount ?? "?").padStart(8)} ${formatBytes(table.TableSizeBytes ?? 0).padStart(10)} ${idxStr.padStart(8)} ${hasStream.padStart(6)}`,
      );
    } catch {
      console.log(
        `${tableName.padEnd(28)} ${"(not created)".padEnd(18)}`,
      );
    }
  }

  console.log("─".repeat(100));
  console.log("");
  console.log("For detailed info on a specific table:");
  console.log("  npm run db:describe <table-name>\n");
}

function printDetailed(table: any): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📋 Table: ${table.TableName}`);
  console.log(`${"═".repeat(60)}`);

  // Status
  console.log(`\n  Status:      ${table.TableStatus}`);
  console.log(`  Created:     ${table.CreationDateTime?.toISOString() ?? "?"}`);
  console.log(`  Item count:  ${table.ItemCount ?? "?"}`);
  console.log(`  Size:        ${formatBytes(table.TableSizeBytes ?? 0)}`);
  console.log(`  Billing:     ${table.BillingModeSummary?.BillingMode ?? "PROVISIONED"}`);

  // Key schema
  console.log("\n  ── Key Schema ──");
  for (const key of table.KeySchema ?? []) {
    console.log(`    ${key.KeyType.padEnd(6)} ${key.AttributeName}`);
  }

  // Attributes
  if (table.AttributeDefinitions?.length > 0) {
    console.log("\n  ── Attributes ──");
    for (const attr of table.AttributeDefinitions) {
      console.log(`    ${attr.AttributeName.padEnd(24)} ${attr.AttributeType}`);
    }
  }

  // GSIs
  if (table.GlobalSecondaryIndexes?.length > 0) {
    console.log("\n  ── Global Secondary Indexes ──");
    for (const gsi of table.GlobalSecondaryIndexes) {
      const keys = (gsi.KeySchema ?? [])
        .map((k: any) => `${k.KeyType}(${k.AttributeName})`)
        .join(", ");
      console.log(`    ${gsi.IndexName}`);
      console.log(`      Keys: ${keys}`);
      console.log(`      Projection: ${gsi.Projection?.ProjectionType ?? "?"}`);
      console.log(`      Status: ${gsi.IndexStatus}`);
    }
  }

  // LSIs
  if (table.LocalSecondaryIndexes?.length > 0) {
    console.log("\n  ── Local Secondary Indexes ──");
    for (const lsi of table.LocalSecondaryIndexes) {
      const keys = (lsi.KeySchema ?? [])
        .map((k: any) => `${k.KeyType}(${k.AttributeName})`)
        .join(", ");
      console.log(`    ${lsi.IndexName}`);
      console.log(`      Keys: ${keys}`);
      console.log(`      Projection: ${lsi.Projection?.ProjectionType ?? "?"}`);
    }
  }

  // Stream
  if (table.LatestStreamArn) {
    console.log("\n  ── Stream ──");
    console.log(`    ARN: ${table.LatestStreamArn}`);
    console.log(`    View type: ${table.StreamSpecification?.StreamViewType ?? "?"}`);
  }

  console.log(`\n${"═".repeat(60)}\n`);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

main().catch((error) => {
  console.error("Describe failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
