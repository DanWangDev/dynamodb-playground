import type { DynamoDBStreamEvent, LambdaResponse } from "./types";

/**
 * Lambda handler for DynamoDB Streams.
 *
 * This is the production pattern for reacting to DynamoDB changes in real-time.
 * Deploy this as a Node.js 18+ Lambda function and connect it to a DynamoDB stream
 * via an event source mapping.
 *
 * Key patterns demonstrated:
 * - Iterating event.Records (the batch of stream records)
 * - Extracting eventName (INSERT | MODIFY | REMOVE), Keys, NewImage, OldImage
 * - Partial batch failure reporting (batchItemFailures)
 * - Structured logging for CloudWatch
 *
 * Deploy with:
 *   aws lambda create-function --function-name stream-demo-processor \
 *     --runtime nodejs22.x --handler lambda-handler.handler \
 *     --role <execution-role-arn> --zip-file fileb://lambda.zip
 *
 *   aws lambda create-event-source-mapping \
 *     --function-name stream-demo-processor \
 *     --event-source-arn <stream-arn> \
 *     --starting-position LATEST
 */
export async function handler(
  event: DynamoDBStreamEvent,
): Promise<LambdaResponse> {
  console.log(
    `[stream-processor] Processing ${event.Records.length} stream records`,
  );

  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records) {
    try {
      const action = getAction(record.eventName);
      console.log(
        `[stream-processor] ${record.eventName}: ${action} — ${JSON.stringify(record.dynamodb.Keys)}`,
      );

      if (record.dynamodb.NewImage) {
        console.log(
          `[stream-processor]   NewImage: ${JSON.stringify(record.dynamodb.NewImage)}`,
        );
      }
      if (record.dynamodb.OldImage) {
        console.log(
          `[stream-processor]   OldImage: ${JSON.stringify(record.dynamodb.OldImage)}`,
        );
      }

      // === Application logic goes here ===
      // Examples of real-world processing:
      //
      // INSERT → send welcome email, provision resources, log audit trail
      // MODIFY → invalidate cache, update search index, notify subscribers
      // REMOVE → clean up related data, archive, send deletion confirmation
      //
      // Each of these calls would be async and wrapped in its own try/catch
      // to isolate failures (one bad record shouldn't block the batch).
    } catch (error) {
      console.error(
        `[stream-processor] Failed to process record ${record.eventID}:`,
        error,
      );
      // Report the failure so Lambda retries only this specific record
      batchItemFailures.push({ itemIdentifier: record.eventID });
    }
  }

  console.log(
    `[stream-processor] Batch complete — ${event.Records.length - batchItemFailures.length}/${event.Records.length} succeeded`,
  );

  return { batchItemFailures };
}

function getAction(eventName: string): string {
  switch (eventName) {
    case "INSERT":
      return "Creating related resources...";
    case "MODIFY":
      return "Updating dependent systems...";
    case "REMOVE":
      return "Cleaning up related data...";
    default:
      return "Processing...";
  }
}

// ─── Explanation helpers (used by the exercise for inline concept display) ───

/** Returns an explanation of the Lambda integration pattern */
export function explainLambdaPattern(): string {
  return `
  Production Pattern: DynamoDB Streams → Lambda
  ═══════════════════════════════════════════════

  1. Item is written to DynamoDB (PutItem, UpdateItem, DeleteItem)
  2. DynamoDB captures the change in the stream (retained for 24 hours)
  3. Lambda polls the stream (via Event Source Mapping)
  4. Lambda invokes your handler with a batch of records
  5. Handler processes each record and reports failures

  Key decisions:
  • Batch size: How many records per invocation (1–10,000)
  • Batch window: Max time Lambda waits to fill a batch
  • Starting position: LATEST (only new changes) or TRIM_HORIZON (all available)
  • Retry policy: Max retry attempts + DLQ for poison-pill records`;
}

/** Returns the AWS CLI deployment commands as a string */
export function explainDeployment(): string {
  return `
  Deploy the Lambda handler:

  # 1. Bundle the handler
  zip -r lambda.zip lambda-handler.js node_modules/

  # 2. Create the Lambda function
  aws lambda create-function \\
    --function-name stream-demo-processor \\
    --runtime nodejs22.x \\
    --handler lambda-handler.handler \\
    --role arn:aws:iam::<account>:role/DynamoDBStreamLambdaRole \\
    --zip-file fileb://lambda.zip \\
    --region eu-west-2

  # 3. Connect Lambda to the DynamoDB stream
  aws lambda create-event-source-mapping \\
    --function-name stream-demo-processor \\
    --event-source-arn <stream-arn> \\
    --starting-position LATEST \\
    --batch-size 10 \\
    --region eu-west-2

  # 4. Watch the Lambda process items in real-time
  # Write an item to the table and check CloudWatch Logs
  # The Lambda will process it within ~1 second`;
}
