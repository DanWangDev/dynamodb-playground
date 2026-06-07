/** Domain types for the Stream Demo table (Module 06: Streams & Lambda) */

/** An item in the stream demo table */
export interface StreamDemoItem {
  pk: string;
  sk: string;
  data: string;
  counter: number;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a new stream demo item */
export type CreateStreamDemoInput = Pick<
  StreamDemoItem,
  "pk" | "sk" | "data"
> & {
  counter?: number;
};

/** Input for updating a stream demo item */
export interface UpdateStreamDemoInput {
  pk: string;
  sk: string;
  data?: string;
  /** Uses ADD expression for atomic, race-condition-free increments */
  incrementBy?: number;
}

/** Simplified stream record for display purposes */
export interface StreamRecordSummary {
  eventName: "INSERT" | "MODIFY" | "REMOVE";
  keys: Record<string, unknown>;
  oldImage?: Record<string, unknown> | null;
  newImage?: Record<string, unknown> | null;
  sequenceNumber: string;
}

/**
 * Lambda event structure — the payload DynamoDB Streams sends to Lambda.
 * This is the actual AWS event shape for DynamoDB Streams → Lambda triggers.
 */
export interface DynamoDBStreamEvent {
  Records: Array<{
    eventID: string;
    eventName: "INSERT" | "MODIFY" | "REMOVE";
    eventVersion: string;
    eventSource: string;
    awsRegion: string;
    dynamodb: {
      Keys: Record<string, unknown>;
      NewImage?: Record<string, unknown>;
      OldImage?: Record<string, unknown>;
      SequenceNumber: string;
      SizeBytes: number;
      StreamViewType: string;
    };
    eventSourceARN: string;
  }>;
}

/** Lambda response for partial batch failure reporting */
export interface LambdaResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}
