import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Order } from "./types";
import type { PaginatedResult } from "../shared/types";

/**
 * Sparse Index Pattern
 *
 * A sparse index contains only items that HAVE the indexed attribute.
 * Items without the attribute are not projected into the index at all.
 *
 * Common use cases:
 * - "Find all orders with a discount code" (orders without one are excluded)
 * - "Find all unprocessed items" (processed items have processedAt set)
 * - "Find all active subscriptions" (expired ones have expiredAt set)
 *
 * The Orders table has a GSI on "discountCode" — only orders WITH a discount
 * code will appear in this index.
 */

/**
 * Query the sparse index — only returns orders that have a discountCode.
 *
 * Items without a discountCode attribute are not in this index at all.
 * This is more efficient than scanning and filtering with attribute_exists().
 */
export async function queryOrdersWithDiscount(
  doc: DynamoDBDocumentClient,
  tableName: string,
  discountCode: string,
): Promise<PaginatedResult<Order>> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "discount-index",
      KeyConditionExpression: "discountCode = :code",
      ExpressionAttributeValues: { ":code": discountCode },
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
 * LSI vs GSI Decision Guide
 *
 * Choose LSI when:
 * ✓ Same partition key as base table
 * ✓ Different sort order needed
 * ✓ Strong consistency required
 * ✓ Known at table creation time
 * ✓ Total partition data < 10GB
 *
 * Choose GSI when:
 * ✓ Different partition key needed
 * ✓ Cross-partition queries
 * ✓ Index may be added after table creation
 * ✓ Eventual consistency is acceptable
 * ✓ Need unlimited partition size
 */

/**
 * Demonstrate when NOT to add an index.
 *
 * If a query pattern is rare (e.g., once-a-month analytics),
 * a Scan might be cheaper than maintaining an extra GSI.
 *
 * This is the classic trade-off: query performance vs storage cost.
 */
export function shouldUseIndex(
  queriesPerSecond: number,
  tableSizeGB: number,
): { useIndex: boolean; reasoning: string } {
  // A rough heuristic — in practice, measure and benchmark
  if (queriesPerSecond > 1) {
    return {
      useIndex: true,
      reasoning:
        "Frequent queries justify the index storage cost. " +
        "Without an index, every query would Scan the entire table.",
    };
  }

  if (tableSizeGB < 0.1) {
    return {
      useIndex: false,
      reasoning:
        "Table is small (<100MB). A periodic Scan costs less than maintaining a GSI. " +
        "Re-evaluate as the table grows.",
    };
  }

  return {
    useIndex: true,
    reasoning:
      "Table is large enough that Scans would be expensive. " +
      "An index is justified even for infrequent queries.",
  };
}
