import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { KEY_PATTERNS, GSI1_PATTERNS } from "./design";
import type { User, Order, Product, AnyEntity, OrderStatus } from "./types";
import type { PaginatedResult } from "../shared/types";

/**
 * Access Pattern: Get all users (admin page).
 *
 * Uses GSI1 where gsi1Pk = "PROFILE".
 * All user items have gsi1Pk="PROFILE", gsi1Sk=<email>.
 */
export async function getAllUsers(
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<PaginatedResult<User>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1Pk = :type",
      ExpressionAttributeValues: { ":type": GSI1_PATTERNS.USER },
    }),
  );

  return {
    items: (result.Items ?? []) as User[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}

/**
 * Access Pattern: Get all products (product listing page).
 *
 * Uses GSI1 where gsi1Pk = "PRODUCT".
 */
export async function getAllProducts(
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<PaginatedResult<Product>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1Pk = :type",
      ExpressionAttributeValues: { ":type": GSI1_PATTERNS.PRODUCT },
    }),
  );

  return {
    items: (result.Items ?? []) as Product[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}

/**
 * Access Pattern: Get all orders by date (fulfillment dashboard).
 *
 * Uses GSI1 where gsi1Pk = "ORDER".
 * Orders are sorted by gsi1Sk = orderDate.
 */
export async function getAllOrders(
  doc: DynamoDBDocumentClient,
  tableName: string,
  ascending = false,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1Pk = :type",
      ExpressionAttributeValues: { ":type": GSI1_PATTERNS.ORDER },
      ScanIndexForward: ascending,
    }),
  );

  return {
    items: (result.Items ?? []) as Order[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}

/**
 * Access Pattern: Get all orders by status.
 *
 * Uses GSI1 (gsi1Pk="ORDER") with a FilterExpression on status.
 * Not as efficient as a dedicated GSI on status, but shows how GSI overloading
 * can serve multiple patterns with one index.
 */
export async function getAllOrdersByStatus(
  doc: DynamoDBDocumentClient,
  tableName: string,
  status: OrderStatus,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1Pk = :type",
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":type": GSI1_PATTERNS.ORDER,
        ":status": status,
      },
    }),
  );

  return {
    items: (result.Items ?? []) as Order[],
    lastEvaluatedKey: result.LastEvaluatedKey,
    hasMore: !!result.LastEvaluatedKey,
  };
}

/**
 * Access Pattern: Get a single order by user + order ID.
 *
 * Direct GetItem — no Query needed.
 */
export async function getOrder(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  orderId: string,
): Promise<Order | null> {
  const result = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: KEY_PATTERNS.ORDER_PK(userId),
        sk: KEY_PATTERNS.ORDER_SK(orderId),
      },
    }),
  );

  const item = result.Item as AnyEntity | undefined;
  if (!item || item.entityType !== "ORDER") return null;
  return item as Order;
}

/**
 * Access Pattern: Get a product by ID.
 *
 * Direct GetItem.
 */
export async function getProduct(
  doc: DynamoDBDocumentClient,
  tableName: string,
  productId: string,
): Promise<Product | null> {
  const result = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: KEY_PATTERNS.PRODUCT_PK(productId),
        sk: KEY_PATTERNS.PRODUCT_SK,
      },
    }),
  );

  const item = result.Item as AnyEntity | undefined;
  if (!item || item.entityType !== "PRODUCT") return null;
  return item as Product;
}
