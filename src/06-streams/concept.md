# Module 06: DynamoDB Streams & Lambda

## What's in This Module

DynamoDB Streams capture a time-ordered sequence of item-level changes in your table. Combined with AWS Lambda, they enable event-driven architectures where changes to your data automatically trigger downstream processing — no polling, no cron jobs, no application-level change tracking.

## 1. DynamoDB Streams — Change Data Capture

Every write to a DynamoDB table (PutItem, UpdateItem, DeleteItem) can be captured as a **stream record**. The stream is a durable, ordered log of changes retained for **24 hours**.

### Stream View Types

When you enable streams on a table, you choose how much information each record contains:

| View Type | Keys | Old Image | New Image |
|-----------|------|-----------|-----------|
| `KEYS_ONLY` | ✓ | — | — |
| `NEW_IMAGE` | ✓ | — | ✓ |
| `OLD_IMAGE` | ✓ | ✓ | — |
| `NEW_AND_OLD_IMAGES` | ✓ | ✓ | ✓ |

Use `NEW_AND_OLD_IMAGES` when you need to detect WHAT changed (e.g., "did the status change from PENDING to SHIPPED?").

### Shards and Iterators

A DynamoDB Stream is divided into **shards**. Each shard contains a contiguous portion of the change log.

```
Stream ARN: arn:aws:dynamodb:eu-west-2:123456789012:table/playground_stream_demo/stream/2024-...
  ├── Shard A (sequence numbers 1000–1999)
  └── Shard B (sequence numbers 2000–2999)
```

Record ordering is guaranteed **within a shard**, but NOT across shards. This means items written in quick succession to different partition keys may appear in different shards and arrive in any order.

### Shard Iterators

To read from a shard, you first get an **iterator** — a pointer to a position in the shard:

| Type | Position |
|------|----------|
| `TRIM_HORIZON` | Start from the oldest available record |
| `LATEST` | Start from just after the most recent record |
| `AFTER_SEQUENCE_NUMBER` | Start after a specific record |

### Reading Pattern

```typescript
// 1. Get the stream ARN from the table
const arn = await getTableStreamArn(raw, "playground_stream_demo");

// 2. Describe the stream to get shards
const shards = await describeStream(arn);

// 3. For each shard, get an iterator
const iterator = await getShardIterator(arn, shard.ShardId, "TRIM_HORIZON");

// 4. Read records using the iterator
const { records, nextIterator } = await getRecords(iterator);

// 5. Keep reading until nextIterator is null
while (nextIterator) {
  const { records, nextIterator: next } = await getRecords(nextIterator);
  // ...
}
```

## 2. Lambda Integration — The Production Pattern

The most common (and powerful) pattern is connecting a DynamoDB Stream directly to a Lambda function. AWS handles the polling, shard-splitting, and retry logic — you just write a handler.

```
Item written to DynamoDB
  → DynamoDB captures in stream
  → Lambda Event Source Mapping polls stream
  → Lambda invokes your handler with batch of records
  → Handler processes and reports any failures
```

### Lambda Handler Structure

```typescript
export async function handler(event: DynamoDBStreamEvent): Promise<LambdaResponse> {
  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      // record.eventName: "INSERT" | "MODIFY" | "REMOVE"
      // record.dynamodb.Keys: primary key attributes
      // record.dynamodb.NewImage: the item after the write (if view type includes it)
      // record.dynamodb.OldImage: the item before the write (if view type includes it)

      await processRecord(record);
    } catch (error) {
      batchItemFailures.push({ itemIdentifier: record.eventID });
    }
  }

  return { batchItemFailures };
}
```

### Event Source Mapping Configuration

| Parameter | Description | Typical Value |
|-----------|-------------|---------------|
| Batch size | Records per Lambda invocation | 10–100 |
| Batch window | Max time to wait for a full batch | 1–10 seconds |
| Starting position | `LATEST` or `TRIM_HORIZON` | `LATEST` |
| Max retry attempts | Retries before DLQ | 3 |
| On-failure destination | SQS queue or SNS topic for poison-pill records | DLQ |

### Partial Batch Failure Reporting

When a Lambda handler returns `batchItemFailures`, Lambda only retries those specific records (not the entire batch). This is critical for production reliability — one bad record shouldn't block an entire batch.

## 3. Deployment — Connecting Lambda to a DynamoDB Stream

### Prerequisites

- Node.js 18+ Lambda runtime
- IAM execution role with permissions:
  - `dynamodb:DescribeStream`
  - `dynamodb:GetRecords`
  - `dynamodb:GetShardIterator`
  - `dynamodb:ListStreams`
  - `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### Step-by-Step

```bash
# 1. Get the stream ARN from your table
aws dynamodb describe-table \
  --table-name playground_stream_demo \
  --query "Table.LatestStreamArn" \
  --region eu-west-2

# 2. Bundle the handler (already in src/06-streams/lambda-handler.ts)
npx esbuild src/06-streams/lambda-handler.ts \
  --bundle --platform=node --target=node18 \
  --outfile=lambda-handler.js
zip lambda.zip lambda-handler.js

# 3. Create the Lambda function
aws lambda create-function \
  --function-name stream-demo-processor \
  --runtime nodejs22.x \
  --handler lambda-handler.handler \
  --role arn:aws:iam::<account-id>:role/DynamoDBStreamLambdaRole \
  --zip-file fileb://lambda.zip \
  --region eu-west-2

# 4. Connect Lambda to the stream
aws lambda create-event-source-mapping \
  --function-name stream-demo-processor \
  --event-source-arn <stream-arn> \
  --starting-position LATEST \
  --batch-size 10 \
  --region eu-west-2

# 5. Test it!
# Write an item to playground_stream_demo, then check CloudWatch Logs
# for the Lambda processing the stream record.
```

## What You'll Practice

1. Enable DynamoDB Streams on a table
2. Create, update, and delete items — generating INSERT, MODIFY, and REMOVE stream records
3. Read and summarise stream records using shard iteration
4. Examine a production-ready Lambda handler function
5. Understand the deployment process (IAM roles, event source mapping, CloudWatch Logs)

## Key Gotchas

- **Streams only work on real AWS** — the dynalite emulator does not support them. Comment out `DDB_ENDPOINT` in your `.env` to use cloud DynamoDB.
- **Records take a few seconds to appear** — DynamoDB Streams is "near real-time", not instant. Wait 2–3 seconds after writes before reading.
- **24-hour retention** — Records older than 24 hours are automatically deleted. You can't recover deleted records.
- **At-least-once delivery** — The same record may be delivered to Lambda more than once. Your handler MUST be idempotent.
- **No ordering across shards** — Records from different partition keys may arrive in different shards and in any order.
- **TTL deletes generate REMOVE events** — These appear in streams just like explicit DeleteItem calls.
- **Lambda costs apply** — Each stream record processed by Lambda counts as an invocation. Batch size affects cost: larger batches = fewer invocations = lower cost.
