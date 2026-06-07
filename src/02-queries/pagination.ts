import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Order } from "./types";
import type { PaginatedResult, PaginationCursor } from "../shared/types";

/**
 * Pagination patterns in DynamoDB.
 *
 * DynamoDB pagination differs from SQL pagination:
 * - No "OFFSET 20 LIMIT 10" — you can't skip to page N directly
 * - Instead, you get a cursor (LastEvaluatedKey) and pass it as ExclusiveStartKey
 * - This is called "cursor-based pagination" or "forward-only pagination"
 * - Each page has a max size of 1MB (DynamoDB hard limit)
 * - You can use Limit to set a smaller page size
 */

/**
 * Fetch a single page of orders for a customer.
 * Returns the items, the cursor for the next page, and whether there are more.
 */
export async function getOrdersPage(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  pageSize: number,
  cursor: PaginationCursor,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "customerId = :customerId",
      ExpressionAttributeValues: { ":customerId": customerId },
      Limit: pageSize,
      ...(cursor ? { ExclusiveStartKey: cursor } : {}),
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
 * Fetch ALL orders for a customer — transparently handles pagination.
 *
 * This is the pattern for "I want all matching items, not just a page."
 * It loops internally, collecting all pages until there's nothing left.
 *
 * WARNING: For large datasets, this could consume a lot of memory.
 * In production, consider processing pages incrementally instead.
 */
export async function getAllOrdersForCustomer(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  pageSize = 50,
): Promise<Order[]> {
  const allItems: Order[] = [];
  let cursor: PaginationCursor;

  do {
    const page = await getOrdersPage(doc, tableName, customerId, pageSize, cursor);
    allItems.push(...page.items);
    cursor = page.lastEvaluatedKey;
  } while (cursor);

  return allItems;
}

/**
 * Pagination helper — iterate over pages with a callback.
 *
 * This is the memory-efficient pattern: process each page as it arrives
 * without accumulating all items in memory.
 */
export async function forEachOrderPage(
  doc: DynamoDBDocumentClient,
  tableName: string,
  customerId: string,
  pageSize: number,
  callback: (page: Order[], pageIndex: number) => Promise<void> | void,
): Promise<number> {
  let cursor: PaginationCursor;
  let pageIndex = 0;
  let totalProcessed = 0;

  do {
    const page = await getOrdersPage(doc, tableName, customerId, pageSize, cursor);
    if (page.items.length === 0) break; // defensive: some emulators may return an empty trailing page
    await callback(page.items, pageIndex);
    totalProcessed += page.items.length;
    pageIndex++;
    cursor = page.lastEvaluatedKey;
  } while (cursor);

  return totalProcessed;
}
