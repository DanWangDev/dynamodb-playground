import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Book } from "./types";
import { ConditionalCheckError } from "../shared/errors";

export interface DeleteBookOptions {
  /** Only delete if this condition is met (e.g., rating below threshold) */
  conditionExpression?: string;
  conditionNames?: Record<string, string>;
  conditionValues?: Record<string, unknown>;
}

/**
 * DeleteItem — Remove a book from the table.
 *
 * Key learning points:
 * - DeleteItem requires the FULL primary key (partition key + sort key if composite)
 * - Without a ConditionExpression, DeleteItem is idempotent — deleting a non-existent item succeeds
 * - Use ConditionExpression to guard against accidental deletion:
 *     - attribute_exists(isbn) — only delete if the item exists
 *     - #rating < :threshold — only delete if a condition is met
 * - ReturnValues: "ALL_OLD" returns the item as it was before deletion
 * - Deleting an item that doesn't exist does NOT throw (unless you use a condition)
 */
export async function deleteBook(
  doc: DynamoDBDocumentClient,
  tableName: string,
  isbn: string,
  options: DeleteBookOptions = {},
): Promise<Book | null> {
  const {
    conditionExpression,
    conditionNames = {},
    conditionValues = {},
  } = options;

  // Combine attribute_exists with any custom conditions
  const allConditions = ["attribute_exists(isbn)"];
  if (conditionExpression) {
    allConditions.push(conditionExpression);
  }

  const allNames: Record<string, string> = {
    "#isbn": "isbn",
    ...conditionNames,
  };

  try {
    const result = await doc.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { isbn },
        ConditionExpression: allConditions.join(" AND "),
        ExpressionAttributeNames: allNames,
        ExpressionAttributeValues:
          Object.keys(conditionValues).length > 0 ? conditionValues : undefined,
        // Return the item as it was before deletion
        ReturnValues: "ALL_OLD",
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    return (result.Attributes as Book) ?? null;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      throw new ConditionalCheckError(
        `Cannot delete book ${isbn}: condition not met or item does not exist`,
        error,
      );
    }
    throw error;
  }
}

/**
 * DeleteItem — Simple deletion that succeeds even if the item doesn't exist.
 * This is the default DynamoDB behavior — no condition, no error on missing items.
 */
export async function deleteBookSilent(
  doc: DynamoDBDocumentClient,
  tableName: string,
  isbn: string,
): Promise<void> {
  await doc.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { isbn },
    }),
  );
}
