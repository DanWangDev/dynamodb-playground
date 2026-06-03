import { z } from "zod";

/**
 * Shared Zod schemas for DynamoDB attribute validation.
 * These are building blocks for module-specific schemas.
 */

/** Validates a string that can be used as a partition key */
export const partitionKey = z
  .string()
  .min(1, "Partition key must not be empty")
  .max(2048, "Partition key exceeds DynamoDB maximum length");

/** Validates a string that can be used as a sort key */
export const sortKey = z
  .string()
  .min(1, "Sort key must not be empty")
  .max(1024, "Sort key exceeds DynamoDB maximum length");

/** Validates an ISO 8601 date string */
export const isoDateString = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    "Must be a valid ISO 8601 date string",
  );

/** Validates a positive integer */
export const positiveInt = z.number().int().positive("Must be a positive integer");

/** Validates a non-negative integer (zero or positive) */
export const nonNegativeInt = z.number().int().min(0, "Must be non-negative");

/** Validates that a value is not an empty array */
export const nonEmptyArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).min(1, "Array must not be empty");

/** Validates a table name with prefix convention */
export const tableName = (prefix: string) =>
  z.string().refine(
    (val) => val.startsWith(prefix),
    `Table name must start with "${prefix}"`,
  );

/** Epoch timestamp in seconds (for TTL attributes) */
export const epochSeconds = z
  .number()
  .int()
  .min(0, "Epoch seconds must be non-negative");
