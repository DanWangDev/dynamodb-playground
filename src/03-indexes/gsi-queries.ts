import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Order, OrderStatus } from "./types";
import type { PaginatedResult } from "../shared/types";

/**
 * GSI Query — Get ALL orders by status (across all customers).
 *
 * The Orders table has a GSI named "status-index":
 *   - PK: status
 *   - SK: orderDate
 *
 * Key learning points:
 * - GSI can have a COMPLETELY DIFFERENT partition key than the base table
 * - This enables cross-partition queries: "all PENDING orders" instead of "one customer's orders"
 * - GSIs are eventually consistent — no ConsistentRead option
 * - GSI has its own throughput capacity (in provisioned mode)
 *
 * Use case: "Show me all orders that need to be fulfilled, sorted by date"
 */
export async function queryOrdersByStatus(
  doc: DynamoDBDocumentClient,
  tableName: string,
  status: OrderStatus,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "status-index",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status },
      ScanIndexForward: true, // oldest orders first
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
 * GSI Query — All orders by status, sorted by date descending.
 * Shows newest orders first (typical dashboard view).
 */
export async function queryRecentOrdersByStatus(
  doc: DynamoDBDocumentClient,
  tableName: string,
  status: OrderStatus,
  limit = 10,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "status-index",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status },
      ScanIndexForward: false, // newest first
      Limit: limit,
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
 * GSI Query with FilterExpression — Orders by status, filtered by minimum total.
 *
 * Demonstrates FilterExpression on top of a GSI query.
 * Same principle as base table: FilterExpression applies AFTER the index read.
 */
export async function queryHighValueOrdersByStatus(
  doc: DynamoDBDocumentClient,
  tableName: string,
  status: OrderStatus,
  minTotal: number,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "status-index",
      KeyConditionExpression: "#status = :status",
      FilterExpression: "#total > :minTotal",
      ExpressionAttributeNames: {
        "#status": "status",
        "#total": "total",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":minTotal": minTotal,
      },
      ScanIndexForward: false,
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
 * Compare: Finding orders by status with GSI vs Scan.
 *
 * WITH GSI: Query reads ONLY items with the matching status.
 * WITH Scan: Scan reads EVERY item in the table, then filters.
 *
 * This contrast teaches why indexes matter for query performance.
 */
export async function findOrdersByStatusWithScan(
  doc: DynamoDBDocumentClient,
  tableName: string,
  status: OrderStatus,
): Promise<PaginatedResult<Order>> {
  const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");

  const result = await doc.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status },
      ReturnConsumedCapacity: "TOTAL",
    }),
  );

  return {
    items: (result.Items ?? []) as Order[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}
