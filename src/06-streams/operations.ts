import {
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CreateStreamDemoSchema, UpdateStreamDemoSchema } from "./schemas";
import type { CreateStreamDemoInput, UpdateStreamDemoInput, StreamDemoItem } from "./types";
// Re-export existing stream primitives from the low-level module
export {
  getTableStreamArn,
  describeStream,
  getShardIterator,
  getRecords,
  readAllStreamRecords,
  summarizeRecords,
} from "../05-advanced/streams";

/**
 * Create a new item in the stream demo table.
 * Generates an INSERT event in the stream.
 */
export async function createStreamDemoItem(
  doc: DynamoDBDocumentClient,
  tableName: string,
  input: CreateStreamDemoInput,
): Promise<StreamDemoItem> {
  const validated = CreateStreamDemoSchema.parse(input);

  const item: StreamDemoItem = {
    ...validated,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    }),
  );

  return item;
}

/**
 * Update an item in the stream demo table.
 * Supports updating data and/or atomically incrementing counter.
 * Generates a MODIFY event in the stream.
 */
export async function updateStreamDemoItem(
  doc: DynamoDBDocumentClient,
  tableName: string,
  input: UpdateStreamDemoInput,
): Promise<StreamDemoItem | null> {
  const validated = UpdateStreamDemoSchema.parse(input);

  const setClauses: string[] = ["#updatedAt = :now"];
  const addClauses: string[] = [];
  const names: Record<string, string> = {
    "#updatedAt": "updatedAt",
  };
  const values: Record<string, unknown> = {
    ":now": new Date().toISOString(),
  };

  if (validated.data !== undefined) {
    setClauses.push("#data = :data");
    names["#data"] = "data";
    values[":data"] = validated.data;
  }

  if (validated.incrementBy !== undefined) {
    addClauses.push("#counter :inc");
    names["#counter"] = "counter";
    values[":inc"] = validated.incrementBy;
  }

  const expressionParts: string[] = [];
  if (setClauses.length > 0) {
    expressionParts.push(`SET ${setClauses.join(", ")}`);
  }
  if (addClauses.length > 0) {
    expressionParts.push(`ADD ${addClauses.join(", ")}`);
  }

  const result = await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: validated.pk, sk: validated.sk },
      UpdateExpression: expressionParts.join(" "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );

  return (result.Attributes as StreamDemoItem) ?? null;
}

/**
 * Delete an item from the stream demo table.
 * Generates a REMOVE event in the stream.
 */
export async function deleteStreamDemoItem(
  doc: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  sk: string,
): Promise<void> {
  await doc.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { pk, sk },
    }),
  );
}

/**
 * Read and summarise stream records for a table.
 * Wraps the existing stream utilities into a single convenience function.
 *
 * Note: Records may take a few seconds to appear after writes.
 * Records persist for 24 hours in AWS, shorter in DynamoDB Local.
 */
export async function readAndSummarizeStream(
  tableName: string,
): Promise<{
  streamArn: string | null;
  recordCount: number;
  summaries: Array<{
    eventName: string;
    keys: Record<string, unknown>;
    sequenceNumber: string;
  }>;
}> {
  const { getTableStreamArn, readAllStreamRecords, summarizeRecords } =
    await import("../05-advanced/streams");
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { env } = await import("../config/env");

  const raw = new DynamoDBClient({
    region: env.AWS_REGION,
    ...(env.DDB_ENDPOINT ? { endpoint: env.DDB_ENDPOINT } : {}),
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });

  const streamArn = await getTableStreamArn(raw, tableName);
  raw.destroy();

  if (!streamArn) {
    return { streamArn: null, recordCount: 0, summaries: [] };
  }

  const records = await readAllStreamRecords(streamArn);
  const summaries = summarizeRecords(records);

  return { streamArn, recordCount: records.length, summaries };
}
