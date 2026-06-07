import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { ArticleStats } from "./types";

/**
 * Atomic Counters — Race-condition-free increments.
 *
 * Key learning points:
 * - ADD expression atomically increments/decrements a number
 * - No read-before-write needed — DynamoDB handles the atomicity
 * - ADD on a non-existent attribute: sets it to the add value (0 + N = N)
 * - ADD on a non-existent item: creates the item with the attribute set to N
 *   (only with UpdateItem, not if the item genuinely doesn't exist)
 *
 * Why not GET → increment → PUT?
 *   Thread A: GET x=5
 *   Thread B: GET x=5
 *   Thread A: PUT x=6
 *   Thread B: PUT x=6  ← LOST UPDATE! Should be 7.
 *
 * With ADD, the database handles the increment atomically:
 *   Thread A: ADD x 1 → x=6
 *   Thread B: ADD x 1 → x=7  ✓ Correct!
 */

/**
 * Increment the view count for an article.
 *
 * Uses ADD expression — no race condition possible.
 */
function articleKey(articleId: string) {
  return { pk: `ARTICLE#${articleId}`, sk: "STATS" };
}

export async function incrementViews(
  doc: DynamoDBDocumentClient,
  tableName: string,
  articleId: string,
  count = 1,
): Promise<number> {
  const result = await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: articleKey(articleId),
      UpdateExpression: "ADD #views :count",
      ExpressionAttributeNames: { "#views": "views" },
      ExpressionAttributeValues: { ":count": count },
      ReturnValues: "UPDATED_NEW",
    }),
  );

  return (result.Attributes?.views as number) ?? 0;
}

/**
 * Like an article — increments the likes counter.
 */
export async function likeArticle(
  doc: DynamoDBDocumentClient,
  tableName: string,
  articleId: string,
): Promise<number> {
  const result = await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: articleKey(articleId),
      UpdateExpression: "ADD #likes :one",
      ExpressionAttributeNames: { "#likes": "likes" },
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );

  return (result.Attributes?.likes as number) ?? 0;
}

/**
 * Decrement a counter — used for inventory or capacity tracking.
 */
export async function decrementCounter(
  doc: DynamoDBDocumentClient,
  tableName: string,
  articleId: string,
  attrName: string,
  amount = 1,
): Promise<number> {
  const result = await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: articleKey(articleId),
      UpdateExpression: "ADD #attr :amount",
      ConditionExpression: "#attr >= :amount", // prevent going negative
      ExpressionAttributeNames: { "#attr": attrName },
      ExpressionAttributeValues: { ":amount": -amount }, // negative → decrement
      ReturnValues: "UPDATED_NEW",
    }),
  );

  return (result.Attributes?.[attrName] as number) ?? 0;
}

/**
 * Get current article stats.
 */
export async function getArticleStats(
  doc: DynamoDBDocumentClient,
  tableName: string,
  articleId: string,
): Promise<ArticleStats | null> {
  const result = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: articleKey(articleId),
    }),
  );

  return (result.Item as ArticleStats) ?? null;
}

/**
 * Reset a counter to zero.
 */
export async function resetCounter(
  doc: DynamoDBDocumentClient,
  tableName: string,
  articleId: string,
  attrName: string,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: articleKey(articleId),
      UpdateExpression: "SET #attr = :zero",
      ExpressionAttributeNames: { "#attr": attrName },
      ExpressionAttributeValues: { ":zero": 0 },
    }),
  );
}

/**
 * Race Condition Demo (conceptual — not actually run in parallel)
 *
 * This shows the problem. For real parallel testing, you'd use
 * Promise.all with multiple ADD operations.
 */
export function explainAtomicCounter(): string {
  return `
  Without ADD (race condition):
    Thread A reads views=10
    Thread B reads views=10
    Thread A writes views=11
    Thread B writes views=11
    Result: views=11 (LOST one increment!)

  With ADD (atomic):
    Thread A: ADD views 1
    Thread B: ADD views 1
    DynamoDB handles both atomically
    Result: views=12 (correct!)
  `;
}
