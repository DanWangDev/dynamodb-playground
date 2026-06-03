import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Order, OrderStatus } from "./types";
import type { PaginatedResult } from "../shared/types";

export interface QueryOrdersOptions {
  /** Sort by orderDate ascending (default) or descending */
  ascending?: boolean;
  /** Maximum items to return */
  limit?: number;
  /** Pagination cursor from a previous query */
  startKey?: Record<string, unknown>;
}

/**
 * Query — Get all orders for a specific customer.
 *
 * Key learning points:
 * - Query REQUIRES an exact partition key match (customerId)
 * - Without a sort key condition, returns ALL items with that PK (sorted by SK)
 * - ScanIndexForward controls ascending (true) vs descending (false)
 * - Query is the most efficient read operation after GetItem
 */
export async function queryOrdersByCustomer(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  options: QueryOrdersOptions = {},
): Promise<PaginatedResult<Order>> {
  const { ascending = true, limit, startKey } = options;

  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "customerId = :customerId",
      ExpressionAttributeValues: { ":customerId": customerId },
      ScanIndexForward: ascending,
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
 * Query — Get orders for a customer within a date range.
 *
 * Demonstrates KeyConditionExpression with BETWEEN on the sort key.
 * BETWEEN is inclusive of both start and end values.
 */
export async function queryOrdersByDateRange(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  startDate: string,
  endDate: string,
  options: QueryOrdersOptions = {},
): Promise<PaginatedResult<Order>> {
  const { ascending = true, limit, startKey } = options;

  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression:
        "customerId = :customerId AND orderDate BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":customerId": customerId,
        ":start": startDate,
        ":end": endDate,
      },
      ScanIndexForward: ascending,
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
 * Query — Get orders for a customer from a specific date onwards.
 *
 * Demonstrates KeyConditionExpression with >= on the sort key.
 */
export async function queryOrdersFromDate(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  fromDate: string,
  options: QueryOrdersOptions = {},
): Promise<PaginatedResult<Order>> {
  const { ascending = true, limit, startKey } = options;

  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression:
        "customerId = :customerId AND orderDate >= :fromDate",
      ExpressionAttributeValues: {
        ":customerId": customerId,
        ":fromDate": fromDate,
      },
      ScanIndexForward: ascending,
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
 * Query — Get orders with a prefix match on the sort key.
 *
 * Demonstrates begins_with on the sort key.
 * Useful for hierarchical keys like: "2024-01-15T10:30:00Z" → begins_with "2024-01"
 */
export async function queryOrdersByDatePrefix(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  datePrefix: string,
  options: QueryOrdersOptions = {},
): Promise<PaginatedResult<Order>> {
  const { ascending = true, limit, startKey } = options;

  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression:
        "customerId = :customerId AND begins_with(orderDate, :prefix)",
      ExpressionAttributeValues: {
        ":customerId": customerId,
        ":prefix": datePrefix,
      },
      ScanIndexForward: ascending,
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
 * Query — Get orders for a customer filtered by status.
 *
 * Demonstrates FilterExpression ON TOP OF a Query.
 * FilterExpression is applied AFTER the query reads items — it does NOT reduce RCU cost!
 */
export async function queryOrdersByCustomerAndStatus(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  status: OrderStatus,
  options: QueryOrdersOptions = {},
): Promise<PaginatedResult<Order>> {
  const { ascending = true, limit, startKey } = options;

  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "customerId = :customerId",
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":customerId": customerId,
        ":status": status,
      },
      ScanIndexForward: ascending,
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
