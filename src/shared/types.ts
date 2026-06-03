/** A DynamoDB attribute value as it appears after DocumentClient unmarshalling */
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | { [key: string]: AttributeValue };

/** Generic item representation — DocumentClient returns Record<string, AttributeValue> */
export type DynamoDBItem = Record<string, AttributeValue>;

/** Primary key components */
export interface CompositeKey {
  pk: string;
  sk: string;
}

/** Pagination cursor — maps to ExclusiveStartKey / LastEvaluatedKey */
export type PaginationCursor = Record<string, AttributeValue> | undefined;

/** Paginated result wrapper */
export interface PaginatedResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, AttributeValue>;
  hasMore: boolean;
}

/** Capacity information returned per operation when requested */
export interface ConsumedCapacity {
  tableName: string;
  capacityUnits: number;
  readCapacityUnits?: number;
  writeCapacityUnits?: number;
}

/** Return value options for update/delete operations */
export type ReturnValues =
  | "NONE"
  | "ALL_OLD"
  | "UPDATED_OLD"
  | "ALL_NEW"
  | "UPDATED_NEW";
