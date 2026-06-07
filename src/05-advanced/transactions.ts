import {
  TransactWriteCommand,
  TransactGetCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledError } from "../shared/errors";

/**
 * Transactions — Atomic multi-item operations.
 *
 * Key learning points:
 * - TransactWriteItems: all-or-nothing writes across items/tables (max 100)
 * - TransactGetItems: atomic reads across items/tables (max 100)
 * - Transactions cost 2x normal operations
 * - ClientRequestToken enables idempotency
 * - If ANY item fails, the ENTIRE transaction is cancelled
 *
 * Use case: Create an order AND deduct inventory atomically.
 * If either fails, neither happens — preventing overselling.
 */

/**
 * Atomically create an order and deduct inventory.
 *
 * If inventory is insufficient, the ConditionCheck fails and
 * the entire transaction is rolled back.
 */
export async function createOrderAndDeductInventory(
  doc: DynamoDBDocumentClient,
  orderTable: string,
  inventoryTable: string,
  order: {
    pk: string;
    sk: string;
    orderId: string;
    total: number;
    items: Array<{ productId: string; quantity: number }>;
  },
): Promise<void> {
  try {
    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          // 1. Create the order
          {
            Put: {
              TableName: orderTable,
              Item: {
                ...order,
                status: "PENDING",
                createdAt: new Date().toISOString(),
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          // 2. Deduct inventory for each item
          ...order.items.map((item) => ({
            Update: {
              TableName: inventoryTable,
              Key: { isbn: item.productId },
              UpdateExpression:
                "SET #stock = #stock - :qty, #updated = :now",
              ConditionExpression: "#stock >= :qty",
              ExpressionAttributeNames: {
                "#stock": "stock",
                "#updated": "updatedAt",
              },
              ExpressionAttributeValues: {
                ":qty": item.quantity,
                ":now": new Date().toISOString(),
              },
            },
          })),
        ],
      }),
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "TransactionCanceledException"
    ) {
      throw new TransactionCanceledError(
        "Could not complete order: inventory may be insufficient",
        [],
        error,
      );
    }
    throw error;
  }
}

/**
 * Atomically read an order and its associated inventory items.
 */
export async function getOrderWithInventory(
  doc: DynamoDBDocumentClient,
  orderTable: string,
  inventoryTable: string,
  orderKey: { pk: string; sk: string },
  productIds: string[],
): Promise<{
  order: Record<string, unknown> | null;
  inventory: Record<string, unknown>[];
}> {
  const result = await doc.send(
    new TransactGetCommand({
      TransactItems: [
        {
          Get: {
            TableName: orderTable,
            Key: orderKey,
          },
        },
        ...productIds.map((productId) => ({
          Get: {
            TableName: inventoryTable,
            Key: { isbn: productId },
          },
        })),
      ],
    }),
  );

  const responses = result.Responses ?? [];
  const order = (responses[0] as Record<string, unknown>) ?? null;
  const inventory = responses.slice(1).filter(Boolean) as Record<string, unknown>[];

  return { order, inventory };
}

/**
 * Demonstrates a transaction with a ConditionCheck (no write, just validation).
 *
 * ConditionCheck items don't write — they just validate a condition.
 * If the condition fails, the entire transaction is cancelled.
 */
export async function transferInventory(
  doc: DynamoDBDocumentClient,
  tableName: string,
  fromProductId: string,
  toProductId: string,
  quantity: number,
): Promise<void> {
  try {
    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          // Deduct from source (only if enough stock)
          {
            Update: {
              TableName: tableName,
              Key: { isbn: fromProductId },
              UpdateExpression:
                "SET #stock = #stock - :qty, #updated = :now",
              ConditionExpression: "#stock >= :qty",
              ExpressionAttributeNames: {
                "#stock": "stock",
                "#updated": "updatedAt",
              },
              ExpressionAttributeValues: {
                ":qty": quantity,
                ":now": new Date().toISOString(),
              },
            },
          },
          // Add to destination (only if product exists)
          {
            Update: {
              TableName: tableName,
              Key: { isbn: toProductId },
              UpdateExpression:
                "SET #stock = #stock + :qty, #updated = :now",
              ConditionExpression: "attribute_exists(#isbn)",
              ExpressionAttributeNames: {
                "#stock": "stock",
                "#updated": "updatedAt",
                "#isbn": "isbn",
              },
              ExpressionAttributeValues: {
                ":qty": quantity,
                ":now": new Date().toISOString(),
              },
            },
          },
        ],
      }),
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "TransactionCanceledException"
    ) {
      throw new TransactionCanceledError(
        `Could not transfer ${quantity} units from ${fromProductId} to ${toProductId}`,
        [],
        error,
      );
    }
    throw error;
  }
}
