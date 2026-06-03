import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Book } from "./types";
import { ItemNotFoundError } from "../shared/errors";

export interface GetBookOptions {
  /** Whether to use strongly consistent reads. Default: false (eventually consistent) */
  consistent?: boolean;
  /** Specific attributes to retrieve. Default: all attributes */
  projection?: string[];
}

/**
 * GetItem — Read a single book by its primary key (ISBN).
 *
 * Key learning points:
 * - GetItem requires the FULL primary key — partition key + sort key (if composite)
 * - Eventually consistent reads (default): faster, cheaper (0.5 RCU per 4KB), may return stale data
 * - Strongly consistent reads: always returns latest write, costs 1 RCU per 4KB
 * - ProjectionExpression: ask only for the attributes you need — saves bandwidth and RCU
 * - If the item doesn't exist, GetItem returns no `Item` field (not an error)
 */
export async function getBook(
  doc: DynamoDBDocumentClient,
  tableName: string,
  isbn: string,
  options: GetBookOptions = {},
): Promise<Book> {
  const { consistent = false, projection } = options;

  const result = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: { isbn },
      ConsistentRead: consistent,
      ...(projection && projection.length > 0
        ? { ProjectionExpression: projection.join(", ") }
        : {}),
      ReturnConsumedCapacity: "TOTAL",
    }),
  );

  if (!result.Item) {
    throw new ItemNotFoundError({ isbn });
  }

  return result.Item as Book;
}
