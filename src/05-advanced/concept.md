# Module 05: Advanced DynamoDB Features

## What's in This Module

This module covers the features that take you from "I can use DynamoDB" to "I can design production systems on DynamoDB":

1. **Transactions** — atomic multi-item operations
2. **Batch Operations** — efficient bulk reads/writes
3. **DynamoDB Streams** — change data capture
4. **TTL** — automatic item expiration
5. **Conditional Writes** — optimistic locking and safety guards
6. **Atomic Counters** — race-condition-free increments

---

## 1. Transactions

DynamoDB supports ACID transactions across multiple items (even across tables).

### TransactWriteItems
Atomically write up to **100 items** across tables. All succeed or all fail.

```typescript
await doc.send(new TransactWriteItemsCommand({
  TransactItems: [
    { Put: { TableName: "orders", Item: order } },
    { Update: { TableName: "inventory", Key: {...}, UpdateExpression: "SET stock = stock - :qty" } },
    { ConditionCheck: { TableName: "users", Key: {...}, ConditionExpression: "attribute_exists(pk)" } },
  ]
}));
```

**Use case**: Deduct inventory, create order, charge customer — all atomically.

### TransactGetItems
Atomically read up to **100 items** across tables.

```typescript
const result = await doc.send(new TransactGetItemsCommand({
  TransactItems: [
    { Get: { TableName: "users", Key: { pk: "USER#alice" } } },
    { Get: { TableName: "orders", Key: { pk: "ORDER#1" } } },
  ]
}));
```

**Key constraints**:
- Max 100 items per transaction
- No cross-region transactions
- Transactions cost 2x normal writes/reads
- `ClientRequestToken` for idempotency (prevents double-processing)

---

## 2. Batch Operations

Batch operations efficiently read/write multiple items in a single request. Unlike transactions, batches are NOT atomic — some items may succeed while others fail.

### BatchWriteItem
Write up to **25 items** (or 16MB) per request. Used for bulk imports and data migration.

**Important**: If DynamoDB can't process all items, it returns `UnprocessedItems`. You MUST retry these.

```typescript
// The chunk-and-retry pattern
async function batchWriteAll(items) {
  for (const chunk of chunkArray(items, 25)) {
    const result = await doc.send(new BatchWriteCommand({ RequestItems: { [table]: chunk } }));
    // Retry unprocessed items
    while (result.UnprocessedItems?.[table]?.length) {
      // Exponential backoff and retry...
    }
  }
}
```

### BatchGetItem
Read up to **100 items** (or 16MB) across tables. Items are returned by table.

**Important**: BatchGetItem returns items from multiple partitions in parallel, but it may not return all items. Check `UnprocessedKeys`.

---

## 3. DynamoDB Streams

Streams have been expanded into their own module with a full walkthrough and Lambda integration pattern. See **Module 06: Streams & Lambda** (`npm run exercise:streams`).

The low-level shard-iteration primitives (`getTableStreamArn`, `describeStream`, `getShardIterator`, `getRecords`, `readAllStreamRecords`, `summarizeRecords`) are defined in `src/05-advanced/streams.ts` and re-exported by Module 06.

---

## 4. TTL (Time To Live)

TTL automatically deletes items after a specified timestamp.

```typescript
// Set TTL to 1 hour from now
const item = {
  pk: "SESSION#abc123",
  sk: "DATA",
  data: {...},
  ttl: Math.floor(Date.now() / 1000) + 3600  // epoch seconds
};
```

**Key behaviors**:
- TTL is specified as **epoch seconds** (not milliseconds)
- Deletion is **best-effort** — items may persist up to 48 hours after TTL
- Deleted items are removed from both the base table AND all GSIs/LSIs
- TTL deletes DO appear in DynamoDB Streams (if enabled)
- No additional cost for TTL deletes (beyond the background deletion)

---

## 5. Conditional Writes & Optimistic Locking

Condition expressions prevent lost updates and enforce business rules.

### Common Condition Expressions

```typescript
// Only update if item exists
ConditionExpression: "attribute_exists(pk)"

// Only create if item doesn't exist (idempotent create)
ConditionExpression: "attribute_not_exists(pk)"

// Only delete if status is not already SHIPPED
ConditionExpression: "#status <> :shipped"

// Only update if version matches (optimistic locking)
ConditionExpression: "#version = :expectedVersion"
```

### Optimistic Locking Pattern
Add a `version` attribute. On each update, increment it AND check it matches:

```typescript
await doc.send(new UpdateCommand({
  Key: { pk, sk },
  UpdateExpression: "SET #data = :data, #version = :newVersion",
  ConditionExpression: "#version = :expectedVersion",
  ExpressionAttributeValues: {
    ":data": newData,
    ":newVersion": currentVersion + 1,
    ":expectedVersion": currentVersion,
  },
}));
```

If another process updated the item first, the condition fails → retry with the new version.

---

## 6. Atomic Counters

The `ADD` expression atomically increments/decrements a numeric attribute.

```typescript
// Atomically increment page views
await doc.send(new UpdateCommand({
  Key: { pk: "ARTICLE#123" },
  UpdateExpression: "ADD #views :one",
  ExpressionAttributeNames: { "#views": "views" },
  ExpressionAttributeValues: { ":one": 1 },
}));
```

**Why not GET → increment → PUT?** That's a race condition — two concurrent requests can both read the same value, increment it, and write back the same result.

`ADD` is atomic — DynamoDB guarantees the increment happens in isolation.

---

## What You'll Practice

1. Atomic order creation + inventory deduction with transactions
2. Bulk import products with batch writes and retry
3. Read DynamoDB Stream records from the orders table
4. Create expiring sessions with TTL
5. Implement optimistic locking on user profiles
6. Build a page-view counter with atomic increments

## Key Gotchas

- **Transactions cost 2x** — don't use them when eventual consistency suffices
- **BatchWrite has a 25-item limit** — always chunk and retry
- **TTL is NOT real-time** — items can live up to 48 hours past expiration
- **Stream records are not ordered across shards** — only within a single shard
- **Conditional check failures eat WCU** — you pay for the write attempt even when the condition fails
- **ADD on non-existent attributes** — ADD on a non-existent numeric attribute sets it to the ADD value (0 + 1 = 1)
