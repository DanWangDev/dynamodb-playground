import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Order } from "./types";
import type { PaginatedResult } from "../shared/types";

/**
 * LSI Query — Get orders for a customer, sorted by total amount.
 *
 * The Orders table has an LSI named "total-index":
 *   - PK: customerId (same as base table)
 *   - SK: total (different sort key — numeric)
 *
 * Key learning points:
 * - LSI shares the partition key with the base table
 * - LSI can have a different sort key for alternative query patterns
 * - LSI supports strongly consistent reads (unlike GSI)
 * - LSI must be created at table creation time — cannot add later
 *
 * Use case: "Show me customer X's orders, sorted by price (cheapest first)"
 */
export async function queryOrdersByTotal(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  minTotal?: number,
  maxTotal?: number,
): Promise<PaginatedResult<Order>> {
  const conditions: string[] = ["customerId = :customerId"];
  const values: Record<string, unknown> = { ":customerId": customerId };
  let hasFilter = false;

  if (minTotal !== undefined && maxTotal !== undefined) {
    // Use BETWEEN to avoid "only one condition per key" restriction
    conditions.push("#total BETWEEN :minTotal AND :maxTotal");
    values[":minTotal"] = minTotal;
    values[":maxTotal"] = maxTotal;
    hasFilter = true;
  } else if (minTotal !== undefined) {
    conditions.push("#total >= :minTotal");
    values[":minTotal"] = minTotal;
    hasFilter = true;
  } else if (maxTotal !== undefined) {
    conditions.push("#total <= :maxTotal");
    values[":maxTotal"] = maxTotal;
    hasFilter = true;
  }

  const command: any = {
    TableName: tableName,
    IndexName: "total-index",
    KeyConditionExpression: conditions.join(" AND "),
    ExpressionAttributeValues: values,
    ConsistentRead: true,
    ScanIndexForward: true, // ascending = cheapest first
    ReturnConsumedCapacity: "TOTAL",
  };

  // Only include ExpressionAttributeNames when #total is actually used
  if (hasFilter) {
    command.ExpressionAttributeNames = { "#total": "total" };
  }

  const result = await doc.send(new QueryCommand(command));

  return {
    items: (result.Items ?? []) as Order[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}

/**
 * LSI Query — Get orders for a customer with total above a threshold,
 * sorted descending (most expensive first).
 *
 * Demonstrates:
 * - Numeric sort key with comparison operators
 * - Descending sort order
 * - LSI strong consistency
 */
export async function queryMostExpensiveOrders(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  minTotal: number,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "total-index",
      KeyConditionExpression:
        "customerId = :customerId AND #total >= :minTotal",
      ExpressionAttributeNames: { "#total": "total" },
      ExpressionAttributeValues: {
        ":customerId": customerId,
        ":minTotal": minTotal,
      },
      ConsistentRead: true,
      ScanIndexForward: false, // descending = most expensive first
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
 * Compare: Same query on base table vs LSI.
 *
 * Without an LSI, getting orders sorted by total would require:
 *  1. Query all orders for the customer (sorted by orderDate)
 *  2. Sort them in-memory by total
 *
 * With the LSI, DynamoDB does the sorting for you, server-side.
 * This saves bandwidth (no need to fetch all items) and client-side CPU.
 */
export async function queryOrdersByCustomerBaseTable(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "customerId = :customerId",
      ExpressionAttributeValues: { ":customerId": customerId },
      ScanIndexForward: true, // sorted by orderDate
      ReturnConsumedCapacity: "TOTAL",
    }),
  );

  return {
    items: (result.Items ?? []) as Order[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}
