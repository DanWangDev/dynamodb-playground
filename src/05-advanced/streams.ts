import {
  DynamoDBStreamsClient,
  DescribeStreamCommand,
  GetShardIteratorCommand,
  GetRecordsCommand,
  type Shard,
  type _Record,
} from "@aws-sdk/client-dynamodb-streams";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { env } from "../config/env";

/**
 * DynamoDB Streams — Change Data Capture for DynamoDB.
 *
 * Key learning points:
 * - Streams capture a time-ordered sequence of item-level changes
 * - Each stream is divided into shards (partitions of the change log)
 * - Stream view types: KEYS_ONLY, NEW_IMAGE, OLD_IMAGE, NEW_AND_OLD_IMAGES
 * - Shard iterators: TRIM_HORIZON, LATEST, AFTER_SEQUENCE_NUMBER
 * - Records persist for 24 hours (production); shorter in DynamoDB Local
 *
 * Production pattern: Stream → Lambda trigger → process each batch
 * This module shows the raw shard-iteration API for understanding.
 */

function createStreamsClient(): DynamoDBStreamsClient {
  return new DynamoDBStreamsClient({
    endpoint: env.DDB_ENDPOINT,
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Get the Stream ARN for a table.
 */
export async function getTableStreamArn(
  raw: DynamoDBClient,
  tableName: string,
): Promise<string | null> {
  const { DescribeTableCommand } = await import(
    "@aws-sdk/client-dynamodb"
  );

  const result = await raw.send(
    new DescribeTableCommand({ TableName: tableName }),
  );

  const streamArn = result.Table?.LatestStreamArn;
  return streamArn ?? null;
}

/**
 * Describe a stream — get shard information.
 */
export async function describeStream(
  streamArn: string,
): Promise<Shard[]> {
  const client = createStreamsClient();

  const result = await client.send(
    new DescribeStreamCommand({ StreamArn: streamArn }),
  );

  client.destroy();
  return result.StreamDescription?.Shards ?? [];
}

/**
 * Get a shard iterator for reading records.
 *
 * TRIM_HORIZON: start from the oldest available record
 * LATEST: start from just after the most recent record
 */
export async function getShardIterator(
  streamArn: string,
  shardId: string,
  type: "TRIM_HORIZON" | "LATEST" = "TRIM_HORIZON",
): Promise<string | null> {
  const client = createStreamsClient();

  const result = await client.send(
    new GetShardIteratorCommand({
      StreamArn: streamArn,
      ShardId: shardId,
      ShardIteratorType: type,
    }),
  );

  client.destroy();
  return result.ShardIterator ?? null;
}

/**
 * Read records from a shard using an iterator.
 *
 * Each GetRecords call consumes the iterator and returns a new one.
 * Keep calling with the new iterator to keep reading.
 */
export async function getRecords(
  shardIterator: string,
  limit = 100,
): Promise<{
  records: _Record[];
  nextIterator: string | null;
  millisBehindLatest: number;
}> {
  const client = createStreamsClient();

  const result = await client.send(
    new GetRecordsCommand({
      ShardIterator: shardIterator,
      Limit: limit,
    }),
  );

  client.destroy();

  return {
    records: result.Records ?? [],
    nextIterator: result.NextShardIterator ?? null,
    millisBehindLatest: 0, // DynamoDB Local doesn't report this accurately
  };
}

/**
 * Read ALL records from a stream by iterating through all shards.
 *
 * This demonstrates the full stream-reading pattern:
 * 1. Describe stream → get shards
 * 2. For each shard, get iterator → read records → next iterator → repeat
 * 3. Stop when NextShardIterator is null (end of shard)
 */
export async function readAllStreamRecords(
  streamArn: string,
): Promise<_Record[]> {
  const shards = await describeStream(streamArn);
  const allRecords: _Record[] = [];

  for (const shard of shards) {
    let iterator = await getShardIterator(
      streamArn,
      shard.ShardId!,
      "TRIM_HORIZON",
    );

    while (iterator) {
      const { records, nextIterator } = await getRecords(iterator);
      allRecords.push(...records);

      if (!nextIterator) break;
      iterator = nextIterator;
    }
  }

  return allRecords;
}

/**
 * Summarize stream records for human-readable output.
 */
export function summarizeRecords(
  records: _Record[],
): Array<{
  eventName: string;
  keys: Record<string, unknown>;
  sequenceNumber: string;
}> {
  return records.map((r) => ({
    eventName: r.eventName ?? "UNKNOWN",
    keys: r.dynamodb?.Keys ?? {},
    sequenceNumber: r.dynamodb?.SequenceNumber ?? "",
  }));
}
