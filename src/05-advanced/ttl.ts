import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Session } from "./types";

/**
 * TTL (Time To Live) — Automatic item expiration.
 *
 * Key learning points:
 * - TTL is an attribute (typically named "ttl") containing epoch SECONDS
 * - DynamoDB automatically deletes items after the TTL timestamp
 * - Deletion is BEST-EFFORT: items may persist up to 48 hours past TTL
 * - TTL deletes appear in DynamoDB Streams (if stream is enabled)
 * - No extra cost for TTL deletes (beyond the background operation)
 * - The TTL attribute must be configured on the table (see setup script)
 *
 * Common use cases:
 * - Session expiration (this module)
 * - Cache invalidation
 * - Temporary data cleanup
 * - Event archiving (TTL + Stream → archive to S3)
 */

/**
 * Create a session with a TTL.
 *
 * The TTL attribute must be epoch SECONDS, not milliseconds.
 * Formula: Math.floor(Date.now() / 1000) + ttlSeconds
 */
export async function createExpiringSession(
  doc: DynamoDBDocumentClient,
  tableName: string,
  sessionId: string,
  userId: string,
  data: Record<string, unknown>,
  ttlSeconds: number,
): Promise<Session> {
  const now = Math.floor(Date.now() / 1000);

  const session: Session = {
    sessionId,
    userId,
    data,
    createdAt: now,
    ttl: now + ttlSeconds,
  };

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: session,
    }),
  );

  return session;
}

/**
 * Get a session if it still exists (may have been TTL-deleted).
 */
export async function getSession(
  doc: DynamoDBDocumentClient,
  tableName: string,
  sessionId: string,
): Promise<Session | null> {
  const result = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: { sessionId },
    }),
  );

  return (result.Item as Session) ?? null;
}

/**
 * Check if a TTL value has expired based on the current time.
 *
 * This is for CLIENT-SIDE checks. The actual DynamoDB deletion
 * happens on the server side and may be delayed up to 48 hours.
 */
export function isSessionExpired(session: Session): boolean {
  const now = Math.floor(Date.now() / 1000);
  return session.ttl <= now;
}

/**
 * Calculate a future TTL value.
 * Utility for setting consistent TTL timestamps.
 */
export function futureTtl(secondsFromNow: number): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

/**
 * TTL Design Patterns
 *
 * ┌─────────────────────┬──────────────────────────────────┐
 * │ Pattern             │ Description                      │
 * ├─────────────────────┼──────────────────────────────────┤
 * │ Session expiration  │ Delete sessions after N minutes  │
 * │ Cache invalidation  │ Auto-refresh cache every N hours  │
 * │ Temporary data      │ Clean up stale data automatically│
 * │ Event archiving     │ TTL delete → Stream → archive    │
 * │ Soft delete         │ TTL + GSI on "deleted" flag      │
 * └─────────────────────┴──────────────────────────────────┘
 */

export function getTtlDesignPatterns(): Array<{
  name: string;
  ttlValue: number;
  description: string;
}> {
  return [
    {
      name: "Session",
      ttlValue: 3600,
      description: "1 hour — typical web session timeout",
    },
    {
      name: "Password Reset Token",
      ttlValue: 900,
      description: "15 minutes — security best practice",
    },
    {
      name: "API Cache",
      ttlValue: 300,
      description: "5 minutes — balance freshness vs cost",
    },
    {
      name: "Shopping Cart",
      ttlValue: 86400,
      description: "24 hours — abandon cart cleanup",
    },
    {
      name: "Log Retention",
      ttlValue: 2592000,
      description: "30 days — auto-clean old logs",
    },
  ];
}
