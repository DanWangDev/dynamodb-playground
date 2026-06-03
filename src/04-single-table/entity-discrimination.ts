import type { AnyEntity, EntityType } from "./types";

/**
 * Entity Discrimination — How to tell what kind of item you have.
 *
 * In single-table design, items of different types live in the same table.
 * You need a way to tell them apart. Three approaches:
 *
 * 1. PK/SK prefix inspection (structural discrimination)
 * 2. entityType attribute (explicit discrimination)
 * 3. Attribute shape inspection (duck typing — fragile, avoid)
 */

/**
 * Discriminate using the explicit entityType attribute.
 * This is the most reliable approach.
 */
export function getEntityType(entity: AnyEntity): EntityType {
  return entity.entityType;
}

/**
 * Filter a mixed list of items by entity type.
 *
 * This is the core pattern: query returns ALL entity types,
 * then you filter to the type you care about.
 */
export function filterByType<T extends AnyEntity>(
  items: AnyEntity[],
  type: EntityType,
): T[] {
  return items.filter((item) => item.entityType === type) as T[];
}

/**
 * Group a mixed list of items by entity type.
 *
 * Useful when you query a partition and get back a user + orders + reviews.
 */
export function groupByType(items: AnyEntity[]): Record<EntityType, AnyEntity[]> {
  const groups: Record<EntityType, AnyEntity[]> = {
    USER: [],
    ORDER: [],
    PRODUCT: [],
    REVIEW: [],
  };

  for (const item of items) {
    groups[item.entityType].push(item);
  }

  return groups;
}

/**
 * Check if an item is of a specific entity type.
 * Type guard for TypeScript narrowing.
 */
export function isEntityType<T extends AnyEntity>(
  item: AnyEntity,
  type: EntityType,
): item is T {
  return item.entityType === type;
}

/**
 * Safely cast an item to a specific entity type after checking.
 */
export function asEntity<T extends AnyEntity>(
  item: AnyEntity,
  type: EntityType,
): T | null {
  if (item.entityType !== type) return null;
  return item as T;
}

/**
 * Example: Processing a mixed query result.
 *
 * A query on PK=USER#alice returns [PROFILE, ORDER#1, ORDER#2, REVIEW#1].
 * This function shows the pattern for handling each type.
 */
export function processQueryResult(items: AnyEntity[]): {
  userCount: number;
  orderCount: number;
  productCount: number;
  reviewCount: number;
  totalValue: number;
} {
  let userCount = 0;
  let orderCount = 0;
  let productCount = 0;
  let reviewCount = 0;
  let totalValue = 0;

  for (const item of items) {
    switch (item.entityType) {
      case "USER":
        userCount++;
        break;
      case "ORDER":
        orderCount++;
        totalValue += item.total;
        break;
      case "PRODUCT":
        productCount++;
        break;
      case "REVIEW":
        reviewCount++;
        break;
    }
  }

  return { userCount, orderCount, productCount, reviewCount, totalValue };
}
