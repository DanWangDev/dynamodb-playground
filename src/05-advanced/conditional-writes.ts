import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { UserProfile } from "./types";
import { ConditionalCheckError } from "../shared/errors";

/**
 * Conditional Writes & Optimistic Locking.
 *
 * Key learning points:
 * - ConditionExpression enforces preconditions before writes
 * - Failed conditions throw ConditionalCheckFailedException
 * - Optimistic locking prevents lost updates in concurrent environments
 * - You consume WCU even when conditions fail
 */

/**
 * Create a user profile — only if it doesn't already exist.
 *
 * Uses attribute_not_exists to ensure idempotent creation.
 */
export async function createUserProfile(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  name: string,
  email: string,
): Promise<UserProfile> {
  const profile: UserProfile & { pk: string; sk: string } = {
    pk: `USER#${userId}`,
    sk: "PROFILE",
    userId,
    name,
    email,
    version: 0,
    updatedAt: new Date().toISOString(),
  };

  try {
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: profile,
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return profile;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      throw new ConditionalCheckError(
        `User profile "${userId}" already exists`,
        error,
      );
    }
    throw error;
  }
}

/**
 * Update a user profile with optimistic locking.
 *
 * The version number prevents lost updates:
 * 1. Read the profile (get current version)
 * 2. Make changes
 * 3. Update with: "SET ... version = :newVersion WHERE version = :expectedVersion"
 * 4. If condition fails → someone else updated first → re-read and retry
 */
export async function updateUserProfileOptimistic(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  name: string,
  email: string,
  expectedVersion: number,
): Promise<UserProfile> {
  const newVersion = expectedVersion + 1;
  const now = new Date().toISOString();

  try {
    const result = await doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: `USER#${userId}`, sk: "PROFILE" },
        UpdateExpression:
          "SET #name = :name, #email = :email, #version = :newVersion, #updatedAt = :now",
        ConditionExpression: "#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#name": "name",
          "#email": "email",
          "#version": "version",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":name": name,
          ":email": email,
          ":newVersion": newVersion,
          ":expectedVersion": expectedVersion,
          ":now": now,
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    return result.Attributes as UserProfile;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      throw new ConditionalCheckError(
        `Optimistic lock failed for user "${userId}". ` +
          `Expected version ${expectedVersion}, but someone else updated it first. ` +
          `Re-read the item and retry.`,
        error,
      );
    }
    throw error;
  }
}

/**
 * Conditional delete — only delete if the item is in a specific state.
 */
export async function deleteIfNotActive(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<void> {
  try {
    await doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: `USER#${userId}`, sk: "PROFILE" },
        UpdateExpression: "SET #status = :deleted, #updatedAt = :now",
        ConditionExpression: "#status <> :active",
        ExpressionAttributeNames: {
          "#status": "status",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":deleted": "DELETED",
          ":active": "ACTIVE",
          ":now": new Date().toISOString(),
        },
      }),
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      throw new ConditionalCheckError(
        `Cannot delete active user "${userId}"`,
        error,
      );
    }
    throw error;
  }
}

/**
 * Demonstrates the full optimistic locking retry loop.
 *
 * This is the production pattern: try → fail → re-read → retry.
 */
export async function updateWithRetry(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  name: string,
  email: string,
  maxRetries = 3,
): Promise<UserProfile> {
  // First, read the current version
  const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
  const key = { pk: `USER#${userId}`, sk: "PROFILE" };
  let current = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: key,
      ConsistentRead: true, // important: read the latest version
    }),
  );

  if (!current.Item) {
    throw new ConditionalCheckError(`User "${userId}" not found`);
  }

  let profile = current.Item as UserProfile;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await updateUserProfileOptimistic(
        doc,
        tableName,
        userId,
        name,
        email,
        profile.version,
      );
    } catch (error) {
      lastError = error as Error;

      if (
        error instanceof ConditionalCheckError &&
        attempt < maxRetries - 1
      ) {
        // Re-read the current version and retry
        current = await doc.send(
          new GetCommand({
            TableName: tableName,
            Key: key,
            ConsistentRead: true,
          }),
        );
        if (current.Item) {
          profile = current.Item as UserProfile;
        }
      }
    }
  }

  throw (
    lastError ??
    new ConditionalCheckError(
      `Failed to update user "${userId}" after ${maxRetries} retries`,
    )
  );
}
