import {
  BatchWriteCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Batch Operations — Efficient bulk reads and writes.
 *
 * Key learning points:
 * - BatchWriteItem: writes up to 25 items (or 16MB) per request
 * - BatchGetItem: reads up to 100 items (or 16MB) per request
 * - Batches are NOT atomic — partial success is possible
 * - UnprocessedItems MUST be retried (exponential backoff)
 * - 16MB is the total request size, not per-item
 *
 * BatchWrite vs TransactWrite:
 *   Batch: NOT atomic, faster, cheaper, for bulk imports
 *   Transact: ATOMIC, slower, 2x cost, for business operations
 */

/**
 * Write items in batches of 25 with automatic retry for unprocessed items.
 *
 * This is the standard bulk-import pattern:
 * 1. Chunk items into groups of 25
 * 2. Send each chunk as a BatchWrite
 * 3. Collect any UnprocessedItems
 * 4. Retry unprocessed items with exponential backoff
 */
export async function batchWriteWithRetry(
  doc: DynamoDBDocumentClient,
  tableName: string,
  items: Record<string, unknown>[],
  maxRetries = 3,
): Promise<{ written: number; unprocessed: number }> {
  let written = 0;
  let remaining = [...items];

  for (let attempt = 0; attempt < maxRetries && remaining.length > 0; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 100ms, 200ms, 400ms...
      const delay = Math.pow(2, attempt - 1) * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const chunks = chunkArray(remaining, 25);
    const nextRemaining: Record<string, unknown>[] = [];

    for (const chunk of chunks) {
      const result = await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        }),
      );

      written += chunk.length;

      // Collect unprocessed items for retry
      const unprocessed = result.UnprocessedItems?.[tableName];
      if (unprocessed) {
        written -= unprocessed.length;
        for (const u of unprocessed) {
          if (u.PutRequest?.Item) {
            nextRemaining.push(u.PutRequest.Item);
          }
        }
      }
    }

    remaining = nextRemaining;
  }

  return { written, unprocessed: remaining.length };
}

/**
 * Read items in batches of 100.
 *
 * BatchGetItem returns items from multiple keys in one request.
 * Unlike Query, which reads from ONE partition, BatchGet reads
 * from MANY partitions in parallel.
 */
export async function batchGetItems(
  doc: DynamoDBDocumentClient,
  tableName: string,
  keys: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const allItems: Record<string, unknown>[] = [];

  const keyChunks = chunkArray(keys, 100);
  for (const chunk of keyChunks) {
    const result = await doc.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: chunk,
          },
        },
      }),
    );

    const items = result.Responses?.[tableName] ?? [];
    allItems.push(...items);

    // Handle unprocessed keys
    const unprocessedKeys = result.UnprocessedKeys?.[tableName]?.Keys;
    if (unprocessedKeys && unprocessedKeys.length > 0) {
      // In production, retry with backoff. For the playground, we note it.
      console.warn(
        `[batch] ${unprocessedKeys.length} keys unprocessed — retry needed in production`,
      );
    }
  }

  return allItems;
}

/**
 * Delete items in batches — used for bulk cleanup.
 * Same pattern as batchWriteWithRetry but with DeleteRequest.
 */
export async function batchDeleteWithRetry(
  doc: DynamoDBDocumentClient,
  tableName: string,
  keys: Record<string, unknown>[],
  maxRetries = 3,
): Promise<{ deleted: number; unprocessed: number }> {
  let deleted = 0;
  let remaining = [...keys];

  for (let attempt = 0; attempt < maxRetries && remaining.length > 0; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt - 1) * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const chunks = chunkArray(remaining, 25);
    const nextRemaining: Record<string, unknown>[] = [];

    for (const chunk of chunks) {
      const result = await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((key) => ({
              DeleteRequest: { Key: key },
            })),
          },
        }),
      );

      deleted += chunk.length;

      const unprocessed = result.UnprocessedItems?.[tableName];
      if (unprocessed) {
        deleted -= unprocessed.length;
        for (const u of unprocessed) {
          if (u.DeleteRequest?.Key) {
            nextRemaining.push(u.DeleteRequest.Key);
          }
        }
      }
    }

    remaining = nextRemaining;
  }

  return { deleted, unprocessed: remaining.length };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
