/**
 * Single-Table Design — Putting It All Together
 *
 * This file documents the access-pattern-first design process and
 * defines the key structure for the e-commerce single table.
 */

import type { EntityType } from "./types";

/**
 * ─── Access Patterns (what our app needs to do) ────────────────
 *
 * 1. Get a user's profile by ID
 * 2. Get a user's orders (potentially filtered by date)
 * 3. Get a single order by ID
 * 4. Get all products (for the product listing page)
 * 5. Get a product by ID
 * 6. Get all users (admin page)
 * 7. Get all orders by status across all users (fulfillment dashboard)
 * 8. Get reviews for a product
 *
 * ─── Key Design ─────────────────────────────────────────────
 *
 * Base Table:
 *   PK (partition key): composite entity key
 *   SK (sort key): entity-specific identifier
 *
 * GSI1 (inverted index for cross-entity queries):
 *   gsi1Pk: entity type discriminator
 *   gsi1Sk: relevant attribute for sorting
 *
 * ─── Key Schema ──────────────────────────────────────────────
 *
 * Entity    PK                  SK              gsi1Pk      gsi1Sk
 * ─────────────────────────────────────────────────────────────────
 * USER      USER#<userId>       PROFILE         PROFILE     <email>
 * ORDER     USER#<userId>       ORDER#<orderId> ORDER       <orderDate>
 * PRODUCT   PRODUCT#<productId> DETAILS         PRODUCT     <name>
 * REVIEW    PRODUCT#<productId> REVIEW#<revId>  REVIEW      <createdAt>
 *
 * ─── How Access Patterns Map to Queries ─────────────────────
 *
 * 1. Get user profile     → GetItem(PK=USER#alice, SK=PROFILE)
 * 2. Get user's orders    → Query(PK=USER#alice, SK begins_with "ORDER#")
 * 3. Get single order     → GetItem(PK=USER#alice, SK=ORDER#ord1)
 * 4. Get all products     → Query(GSI1, gsi1Pk=PRODUCT)
 * 5. Get product          → GetItem(PK=PRODUCT#p1, SK=DETAILS)
 * 6. Get all users        → Query(GSI1, gsi1Pk=PROFILE)
 * 7. Orders by status     → Query(GSI1, gsi1Pk=ORDER, FilterExpression on status)
 * 8. Product reviews      → Query(PK=PRODUCT#p1, SK begins_with "REVIEW#")
 */

export const KEY_PATTERNS = {
  USER_PK: (userId: string) => `USER#${userId}`,
  USER_SK: "PROFILE",
  ORDER_PK: (userId: string) => `USER#${userId}`,
  ORDER_SK: (orderId: string) => `ORDER#${orderId}`,
  PRODUCT_PK: (productId: string) => `PRODUCT#${productId}`,
  PRODUCT_SK: "DETAILS",
  REVIEW_PK: (productId: string) => `PRODUCT#${productId}`,
  REVIEW_SK: (reviewId: string) => `REVIEW#${reviewId}`,
} as const;

export const GSI1_PATTERNS = {
  USER: "PROFILE",
  ORDER: "ORDER",
  PRODUCT: "PRODUCT",
  REVIEW: "REVIEW",
} as const;

/**
 * Infer entity type from PK or SK prefix.
 * This is how we know what kind of item we're looking at.
 */
export function inferEntityType(pk: string, sk: string): EntityType {
  if (pk.startsWith("USER#") && sk === "PROFILE") return "USER";
  if (pk.startsWith("USER#") && sk.startsWith("ORDER#")) return "ORDER";
  if (pk.startsWith("PRODUCT#") && sk === "DETAILS") return "PRODUCT";
  if (pk.startsWith("PRODUCT#") && sk.startsWith("REVIEW#")) return "REVIEW";
  throw new Error(`Unknown entity type for PK=${pk}, SK=${sk}`);
}

/**
 * Extract the entity ID from a composite key.
 */
export function extractId(compositeKey: string): string {
  const parts = compositeKey.split("#");
  return parts[1] ?? compositeKey;
}
