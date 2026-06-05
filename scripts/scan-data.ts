/**
 * Scans and prints all data in the playground tables.
 *
 * Usage:
 *   npm run db:scan               scan all tables
 *   npm run db:scan books         scan only the books table
 *   npm run db:scan orders books  scan multiple specific tables
 *
 * Run this in a second terminal while stepping through an exercise.
 */

import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { createClientFromEnv } from "../src/config/dynamodb";
import { env } from "../src/config/env";

const PREFIX = env.DDB_TABLE_PREFIX;
const ALL_TABLES = ["books", "orders", "ecommerce", "sessions"];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tables = args.length > 0 ? args : ALL_TABLES;

  const { doc } = createClientFromEnv(env);

  for (const name of tables) {
    const tableName = name.startsWith(PREFIX) ? name : `${PREFIX}${name}`;
    const result = await doc.send(
      new ScanCommand({ TableName: tableName, Limit: 50 }),
    );

    console.log(`\n── ${tableName} (${result.Count} items) ──`);
    if (!result.Items || result.Items.length === 0) {
      console.log("  (empty)");
    } else {
      for (const item of result.Items) {
        console.log(JSON.stringify(item, null, 2));
        console.log("  ──");
      }
    }
  }

  doc.destroy();
}

main().catch((error) => {
  console.error("Scan failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
