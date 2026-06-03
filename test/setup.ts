import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";

/**
 * Global test setup — runs once before all test files.
 * Verifies DynamoDB Local is running and reachable.
 */
export async function setup(): Promise<void> {
  const endpoint = process.env["DDB_ENDPOINT"] ?? "http://localhost:8000";

  const client = new DynamoDBClient({
    endpoint,
    region: process.env["AWS_REGION"] ?? "us-east-1",
    credentials: {
      accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "local",
      secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "local",
    },
  });

  try {
    await client.send(new ListTablesCommand({}));
    console.log(`[test setup] DynamoDB Local reachable at ${endpoint}`);
  } catch (error) {
    console.error(
      `[test setup] Could not reach DynamoDB Local at ${endpoint}.`,
    );
    console.error("Make sure Docker is running and run: npm run dynamodb:start");
    throw error;
  }

  client.destroy();
}

export async function teardown(): Promise<void> {
  console.log("[test teardown] Tests complete");
}
