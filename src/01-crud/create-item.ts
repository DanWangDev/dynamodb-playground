import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CreateBookSchema } from "./schemas";
import type { Book, CreateBookInput } from "./types";
import { ValidationError } from "../shared/errors";

/**
 * PutItem — Create a new book or fully replace an existing one.
 *
 * Key learning points:
 * - PutItem is an UPSERT: if the item already exists with this key, it gets replaced entirely
 * - To prevent overwriting, use a ConditionExpression with attribute_not_exists()
 * - The DocumentClient automatically marshals JS types to DynamoDB types
 * - ReturnValues lets you see what was there before (or after) the write
 */
export async function createBook(
  doc: DynamoDBDocumentClient,
  tableName: string,
  input: CreateBookInput,
): Promise<Book> {
  const validated = CreateBookSchema.parse(input);

  const now = new Date().toISOString();

  const book: Book = {
    isbn: validated.isbn,
    title: validated.title,
    author: validated.author,
    pageCount: validated.pageCount,
    tags: validated.tags,
    published: validated.published,
    rating: validated.rating,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: book,
        // Prevent accidental overwrites — fail if this ISBN already exists
        ConditionExpression: "attribute_not_exists(isbn)",
        ReturnValues: "NONE",
      }),
    );

    return book;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      throw new ValidationError(
        `Book with ISBN "${validated.isbn}" already exists. Use updateBook() to modify it.`,
        error,
      );
    }
    throw error;
  }
}

/**
 * PutItem — Create or replace a book (no condition check).
 * This is the raw PutItem behavior — it overwrites whatever was there.
 */
export async function putBook(
  doc: DynamoDBDocumentClient,
  tableName: string,
  input: CreateBookInput,
): Promise<Book> {
  const validated = CreateBookSchema.parse(input);

  const now = new Date().toISOString();

  const book: Book = {
    isbn: validated.isbn,
    title: validated.title,
    author: validated.author,
    pageCount: validated.pageCount,
    tags: validated.tags,
    published: validated.published,
    rating: validated.rating,
    createdAt: now,
    updatedAt: now,
  };

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: book,
      // No condition — this WILL overwrite an existing item
      ReturnConsumedCapacity: "TOTAL",
    }),
  );

  return book;
}
