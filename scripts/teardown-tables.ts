/**
 * Deletes all playground tables from DynamoDB Local.
 *
 * Usage: npm run teardown
 */

import { DeleteTableCommand, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { env } from "../src/config/env";
import { createDynamoDBClient } from "../src/config/dynamodb";

async function main(): Promise<void> {
  const { raw } = createDynamoDBClient({
    endpoint: env.DDB_ENDPOINT,
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  });

  const result = await raw.send(new ListTablesCommand({}));
  const tables = result.TableNames ?? [];

  const playgroundTables = tables.filter((t) =>
    t.startsWith(env.DDB_TABLE_PREFIX),
  );

  if (playgroundTables.length === 0) {
    console.log("No playground tables found to delete.");
    raw.destroy();
    return;
  }

  console.log(`Deleting ${playgroundTables.length} tables...\n`);

  for (const table of playgroundTables) {
    await raw.send(new DeleteTableCommand({ TableName: table }));
    console.log(`  ✓ Deleted: ${table}`);
  }

  console.log("\nAll playground tables deleted.");
  raw.destroy();
}

main().catch((error) => {
  console.error("Teardown failed:", error);
  process.exit(1);
});
