/**
 * Custom error hierarchy for the DynamoDB playground.
 * Each error type maps to a specific DynamoDB failure mode,
 * teaching the user how to handle errors in production applications.
 */

export class DynamoDBPlaygroundError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DynamoDBPlaygroundError";
  }
}

export class TableNotFoundError extends DynamoDBPlaygroundError {
  constructor(tableName: string, cause?: unknown) {
    super(`Table "${tableName}" not found. Did you run 'npm run setup'?`, cause);
    this.name = "TableNotFoundError";
  }
}

export class ConditionalCheckError extends DynamoDBPlaygroundError {
  constructor(message: string, cause?: unknown) {
    super(`Conditional check failed: ${message}`, cause);
    this.name = "ConditionalCheckError";
  }
}

export class ValidationError extends DynamoDBPlaygroundError {
  constructor(message: string, cause?: unknown) {
    super(`Validation failed: ${message}`, cause);
    this.name = "ValidationError";
  }
}

export class TransactionCanceledError extends DynamoDBPlaygroundError {
  constructor(
    message: string,
    public readonly cancellationReasons: unknown[] = [],
    cause?: unknown,
  ) {
    super(`Transaction cancelled: ${message}`, cause);
    this.name = "TransactionCanceledError";
  }
}

export class ItemNotFoundError extends DynamoDBPlaygroundError {
  constructor(key: Record<string, unknown>, cause?: unknown) {
    super(
      `Item not found with key: ${JSON.stringify(key)}`,
      cause,
    );
    this.name = "ItemNotFoundError";
  }
}

export class BatchUnprocessedError extends DynamoDBPlaygroundError {
  constructor(
    public readonly unprocessedCount: number,
    cause?: unknown,
  ) {
    super(
      `${unprocessedCount} items were not processed in the batch operation`,
      cause,
    );
    this.name = "BatchUnprocessedError";
  }
}
