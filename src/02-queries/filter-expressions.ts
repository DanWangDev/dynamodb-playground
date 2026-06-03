import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Order } from "./types";
import type { PaginatedResult } from "../shared/types";

/**
 * FilterExpression Deep Dive
 *
 * FilterExpression applies AFTER DynamoDB reads items from disk.
 * It's a post-processing step — you pay for every item READ, not every item RETURNED.
 *
 * Common FilterExpression operators:
 *   =, <>, <, <=, >, >=  — comparison
 *   BETWEEN               — range check
 *   IN                    — value in list
 *   attribute_exists()    — attribute is present
 *   attribute_not_exists()— attribute is absent
 *   attribute_type()      — attribute is of a certain type
 *   begins_with()         — string prefix
 *   contains()            — substring or set membership
 *   size()                — length of string, list, or set
 *
 * You can combine with AND / OR (but NOT has higher precedence).
 */

/**
 * Query with a numeric filter — orders with total > a threshold.
 * Demonstrates: > operator in FilterExpression.
 */
export async function queryOrdersAboveTotal(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  minTotal: number,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "customerId = :customerId",
      FilterExpression: "#total > :minTotal",
      ExpressionAttributeNames: { "#total": "total" },
      ExpressionAttributeValues: {
        ":customerId": customerId,
        ":minTotal": minTotal,
      },
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
 * FilterExpression with IN — match multiple status values.
 * Demonstrates: IN operator.
 */
export async function queryOrdersInStatuses(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  statuses: string[],
): Promise<PaginatedResult<Order>> {
  // Build :status0, :status1, ... placeholders
  const statusValues: Record<string, string> = {};
  const statusList: string[] = [];
  statuses.forEach((s, i) => {
    const key = `:status${i}`;
    statusValues[key] = s;
    statusList.push(key);
  });

  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "customerId = :customerId",
      FilterExpression: `#status IN (${statusList.join(", ")})`,
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":customerId": customerId,
        ...statusValues,
      },
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
 * FilterExpression with contains() — find orders containing a specific item name.
 * Demonstrates: contains() on list elements.
 */
export async function queryOrdersContainingItem(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  itemName: string,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "customerId = :customerId",
      FilterExpression: "contains(#items[0].#name, :itemName)",
      ExpressionAttributeNames: {
        "#items": "items",
        "#name": "name",
      },
      ExpressionAttributeValues: {
        ":customerId": customerId,
        ":itemName": itemName,
      },
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
 * FilterExpression with attribute_exists — only items that have a certain attribute.
 * Demonstrates: attribute_exists().
 */
export async function queryOrdersWithDiscount(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "customerId = :customerId",
      FilterExpression: "attribute_exists(discountCode)",
      ExpressionAttributeValues: {
        ":customerId": customerId,
      },
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
 * Scan with complex filter — FIND items, don't just filter.
 * Demonstrates combining multiple conditions with AND.
 */
export async function scanHighValuePendingOrders(
  doc: DynamoDBDocumentClient,
  tableName: string,
  minTotal: number,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "#status = :status AND #total > :minTotal",
      ExpressionAttributeNames: {
        "#status": "status",
        "#total": "total",
      },
      ExpressionAttributeValues: {
        ":status": "PENDING",
        ":minTotal": minTotal,
      },
      ReturnConsumedCapacity: "TOTAL",
    }),
  );

  return {
    items: (result.Items ?? []) as Order[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}
