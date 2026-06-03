/**
 * Index Projection Types
 *
 * When you create an index, you choose how much data gets COPIED into it.
 * This is a storage-cost vs query-flexibility trade-off.
 *
 * ┌─────────────────┬──────────────────────┬──────────────────────┐
 * │ Projection Type  │ What's in the index  │ Query behavior       │
 * ├─────────────────┼──────────────────────┼──────────────────────┤
 * │ KEYS_ONLY        │ Only table keys +    │ Can only return     │
 * │                  │ index keys           │ key attributes       │
 * ├─────────────────┼──────────────────────┼──────────────────────┤
 * │ INCLUDE          │ KEYS_ONLY +          │ Can return specified │
 * │                  │ specified attributes │ attributes directly  │
 * ├─────────────────┼──────────────────────┼──────────────────────┤
 * │ ALL              │ Full item copy       │ Can return anything  │
 * │                  │                      │ (but costs more)     │
 * └─────────────────┴──────────────────────┴──────────────────────┘
 *
 * The trade-off is called the "fetch vs project" decision:
 *
 *   KEYS_ONLY index:
 *     1. Query index → get keys
 *     2. BatchGetItem on base table → get full items
 *     Cost: 1 index query + 1 base table read per item
 *     Best when: items are large and you read few of them
 *
 *   ALL projection:
 *     1. Query index → get full items directly
 *     Cost: 1 index query (but index stores more data)
 *     Best when: you frequently need full items from this access pattern
 */

export type ProjectionType = "KEYS_ONLY" | "INCLUDE" | "ALL";

export interface ProjectionInfo {
  type: ProjectionType;
  description: string;
  storageCost: "low" | "medium" | "high";
  queryCost: "low" | "medium" | "high";
  bestFor: string;
}

export const PROJECTION_GUIDE: Record<ProjectionType, ProjectionInfo> = {
  KEYS_ONLY: {
    type: "KEYS_ONLY",
    description:
      "Only the table's primary key and the index key are stored in the index. " +
      "To get non-key attributes, you must perform a follow-up GetItem.",
    storageCost: "low",
    queryCost: "high", // Because you often need follow-up reads
    bestFor:
      "Large items where you only need keys, or lookup tables where the key IS the data.",
  },
  INCLUDE: {
    type: "INCLUDE",
    description:
      "The index stores the keys plus a specified list of non-key attributes. " +
      "Balances storage cost with query convenience.",
    storageCost: "medium",
    queryCost: "medium",
    bestFor:
      "When most queries need the same few extra attributes (e.g., name + email).",
  },
  ALL: {
    type: "ALL",
    description:
      "A full copy of every projected item is stored in the index. " +
      "Simplest to use — no follow-up reads needed.",
    storageCost: "high",
    queryCost: "low",
    bestFor:
      "Small items, or access patterns that always need the full item.",
  },
};

/**
 * Projection size estimator — helps you think about costs.
 *
 * This is a simplified model. In production, use actual item sizes.
 */
export function estimateIndexStorage(
  itemCount: number,
  avgItemSizeBytes: number,
  projection: ProjectionType,
  extraKeys: { count: number; avgSizeBytes: number },
): { estimatedBytes: number; estimatedMonthlyCost: number } {
  // KEYS_ONLY: just the keys (~50 bytes per key)
  // INCLUDE: keys + specified attributes
  // ALL: full item copy

  const keySizePerItem = 50 + extraKeys.count * extraKeys.avgSizeBytes;

  let bytesPerItem: number;
  switch (projection) {
    case "KEYS_ONLY":
      bytesPerItem = keySizePerItem;
      break;
    case "INCLUDE":
      bytesPerItem = keySizePerItem + extraKeys.avgSizeBytes * extraKeys.count;
      break;
    case "ALL":
      bytesPerItem = avgItemSizeBytes;
      break;
  }

  const totalBytes = itemCount * bytesPerItem;
  // DynamoDB storage: ~$0.25 per GB-month
  const monthlyCost = (totalBytes / 1_000_000_000) * 0.25;

  return {
    estimatedBytes: totalBytes,
    estimatedMonthlyCost: Math.round(monthlyCost * 10000) / 10000,
  };
}
