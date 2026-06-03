import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Order, OrderStatus } from "./types";
import type { PaginatedResult } from "../shared/types";

export interface ScanOptions {
  limit?: number;
  startKey?: Record<string, unknown>;
}

/**
 * Scan — Read every item in the table.
 *
 * Key learning points:
 * - Scan reads the ENTIRE table sequentially — O(n) where n = table size
 * - You pay for ALL items read, even if you filter most of them away
 * - Scan should rarely be used in request paths — prefer Query
 * - Valid use cases: exports, analytics, cache warming, schema migrations
 * - Each Scan returns max 1MB of data — use LastEvaluatedKey to paginate
 */
export async function scanAllOrders(
  doc: DynamoDBDocumentClient,
  tableName: string,
  options: ScanOptions = {},
): Promise<PaginatedResult<Order>> {
  const { limit, startKey } = options;

  const result = await doc.send(
    new ScanCommand({
      TableName: tableName,
      ...(limit ? { Limit: limit } : {}),
      ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      ReturnConsumedCapacity: "TOTAL",
    }),
  );

  return {
    items: (result.Items ?? []) as Order[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}

/**
 * Scan with a FilterExpression — filter while scanning.
 *
 * IMPORTANT: FilterExpression does NOT reduce the number of items scanned.
 * You pay RCU for ALL items in the table, even those filtered out.
 *
 * The Scan result count will be lower (only matching items returned),
 * but the ConsumedCapacity reflects the FULL table scan.
 */
export async function scanOrdersByStatus(
  doc: DynamoDBDocumentClient,
  tableName: string,
  status: OrderStatus,
  options: ScanOptions = {},
): Promise<PaginatedResult<Order>> {
  const { limit, startKey } = options;

  const result = await doc.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status },
      ...(limit ? { Limit: limit } : {}),
      ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      ReturnConsumedCapacity: "TOTAL",
    }),
  );

  return {
    items: (result.Items ?? []) as Order[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}

/**
 * Scan with a limit — paginate through all items.
 * Returns ALL items across multiple Scan calls.
 *
 * This demonstrates the common pattern for batch processing:
 * keep scanning with ExclusiveStartKey until there's nothing left.
 */
export async function scanAllOrdersExhaustive(
  doc: DynamoDBDocumentClient,
  tableName: string,
  pageSize = 50,
): Promise<Order[]> {
  const allItems: Order[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const page = await scanAllOrders(doc, tableName, {
      limit: pageSize,
      startKey,
    });
    allItems.push(...page.items);
    startKey = page.lastEvaluatedKey;
  } while (startKey);

  return allItems;
}
