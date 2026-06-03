import { createDynamoDBClient } from "../../src/config/dynamodb";
import type { DynamoDBClients } from "../../src/config/dynamodb";

/**
 * Creates a DynamoDB client configured for the test environment.
 */
export function createTestClient(): DynamoDBClients {
  const endpoint = process.env["DDB_ENDPOINT"] ?? "http://localhost:8000";
  const region = process.env["AWS_REGION"] ?? "us-east-1";

  return createDynamoDBClient({
    endpoint,
    region,
    accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "local",
    secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "local",
  });
}

/**
 * Generates a unique table name for test isolation.
 */
export function uniqueTableName(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `test_${base}_${suffix}`;
}
