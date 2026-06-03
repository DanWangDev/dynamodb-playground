import { expect } from "vitest";

/**
 * Custom assertions for DynamoDB test results.
 * Each assertion checks both the return value and the shape
 * of DynamoDB responses.
 */

/** Assert that the returned item matches the expected shape (keys present) */
export function expectItemShape<T extends object>(
  item: T,
  requiredKeys: (keyof T)[],
): void {
  for (const key of requiredKeys) {
    expect(item).toHaveProperty(key as string);
  }
}

/** Assert that an array of items is sorted by a date field (ascending) */
export function expectSortedByDate<T extends object>(
  items: T[],
  dateField: keyof T,
  ascending = true,
): void {
  for (let i = 1; i < items.length; i++) {
    const prev = new Date(items[i - 1]![dateField] as string).getTime();
    const curr = new Date(items[i]![dateField] as string).getTime();
    if (ascending) {
      expect(curr).toBeGreaterThanOrEqual(prev);
    } else {
      expect(curr).toBeLessThanOrEqual(prev);
    }
  }
}

/** Assert that a paginated result has the expected structure */
export function expectPaginatedResult<T>(
  result: { items: T[]; hasMore: boolean; lastEvaluatedKey?: unknown },
  expectedMinItems: number,
): void {
  expect(result.items.length).toBeGreaterThanOrEqual(expectedMinItems);
  expect(typeof result.hasMore).toBe("boolean");

  if (result.hasMore) {
    expect(result.lastEvaluatedKey).toBeDefined();
  }
}

/** Assert that the timestamp falls within an acceptable range */
export function expectTimestampNear(
  actual: string,
  expected: Date,
  toleranceMs = 5000,
): void {
  const actualMs = new Date(actual).getTime();
  const expectedMs = expected.getTime();
  expect(Math.abs(actualMs - expectedMs)).toBeLessThanOrEqual(toleranceMs);
}
