import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { UpdateBookSchema } from "./schemas";
import type { Book, UpdateBookInput } from "./types";
import { ItemNotFoundError } from "../shared/errors";

/**
 * UpdateItem — Modify specific attributes of an existing book.
 *
 * Key learning points:
 * - UpdateItem modifies ONLY the attributes you specify — unlike PutItem which replaces everything
 * - Update expressions use a small DSL:
 *     SET — set an attribute value
 *     REMOVE — remove an attribute entirely
 *     ADD — add to a number or set
 *     DELETE — remove elements from a set
 * - ExpressionAttributeNames (#foo) prevent conflicts with DynamoDB reserved words
 * - ExpressionAttributeValues (:bar) are placeholders for values (prevents injection)
 * - ReturnValues lets you see the item before or after the update
 * - If the item doesn't exist and you use a condition, the update fails
 */
export async function updateBook(
  doc: DynamoDBDocumentClient,
  tableName: string,
  input: UpdateBookInput,
): Promise<Book> {
  const validated = UpdateBookSchema.parse(input);

  const now = new Date().toISOString();

  // Build SET clauses dynamically from the provided fields
  const setClauses: string[] = ["#updatedAt = :updatedAt"];
  const expressionNames: Record<string, string> = {
    "#updatedAt": "updatedAt",
  };
  const expressionValues: Record<string, unknown> = {
    ":updatedAt": now,
  };

  if (validated.title !== undefined) {
    setClauses.push("#title = :title");
    expressionNames["#title"] = "title";
    expressionValues[":title"] = validated.title;
  }
  if (validated.author !== undefined) {
    setClauses.push("#author = :author");
    expressionNames["#author"] = "author";
    expressionValues[":author"] = validated.author;
  }
  if (validated.pageCount !== undefined) {
    setClauses.push("#pageCount = :pageCount");
    expressionNames["#pageCount"] = "pageCount";
    expressionValues[":pageCount"] = validated.pageCount;
  }
  if (validated.tags !== undefined) {
    setClauses.push("#tags = :tags");
    expressionNames["#tags"] = "tags";
    expressionValues[":tags"] = validated.tags;
  }
  if (validated.published !== undefined) {
    setClauses.push("#published = :published");
    expressionNames["#published"] = "published";
    expressionValues[":published"] = validated.published;
  }
  if (validated.rating !== undefined) {
    setClauses.push("#rating = :rating");
    expressionNames["#rating"] = "rating";
    expressionValues[":rating"] = validated.rating;
  }

  try {
    const result = await doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { isbn: validated.isbn },
        UpdateExpression: `SET ${setClauses.join(", ")}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        // Only update if the item exists
        ConditionExpression: "attribute_exists(isbn)",
        ReturnValues: "ALL_NEW",
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    return result.Attributes as Book;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      throw new ItemNotFoundError({ isbn: validated.isbn }, error);
    }
    throw error;
  }
}

/**
 * UpdateItem — Add a tag to a book using the ADD expression.
 * Demonstrates using ADD for set operations.
 */
export async function addBookTag(
  doc: DynamoDBDocumentClient,
  tableName: string,
  isbn: string,
  tag: string,
): Promise<Book> {
  const result = await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { isbn },
      UpdateExpression: "ADD #tags :tag",
      ExpressionAttributeNames: { "#tags": "tags" },
      ExpressionAttributeValues: { ":tag": new Set([tag]) },
      ConditionExpression: "attribute_exists(isbn)",
      ReturnValues: "ALL_NEW",
    }),
  );

  if (!result.Attributes) {
    throw new ItemNotFoundError({ isbn });
  }

  return result.Attributes as Book;
}

/**
 * UpdateItem — Remove an attribute from a book using REMOVE.
 */
export async function removeBookAttribute(
  doc: DynamoDBDocumentClient,
  tableName: string,
  isbn: string,
  attributeName: string,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { isbn },
      UpdateExpression: "REMOVE #attr",
      ExpressionAttributeNames: { "#attr": attributeName },
      ConditionExpression: "attribute_exists(isbn)",
    }),
  );
}
