# Module 02: Queries and Scans

## Two Ways to Read Multiple Items

DynamoDB gives you two ways to read more than one item:

| Operation | How it works | Performance | Cost |
|---|---|---|---|
| **Query** | Finds items by partition key, optionally filtered by sort key | Fast, efficient, uses index | 1 RCU per 4KB of returned data |
| **Scan** | Reads EVERY item in the table, then filters | Slow on large tables, reads entire table | 1 RCU per 4KB of SCANNED data (even filtered-out items!) |

**The Golden Rule**: Use Query whenever possible. Scan is for rare operations like exports, analytics, or when you genuinely need every item.

## How Query Works

A Query requires a **partition key** (exact match only — no begins_with on PK). Once DynamoDB finds the partition, it can filter by **sort key** using these operators:

| Operator | Meaning | Example |
|---|---|---|
| `=` | Exact match | `orderDate = :date` |
| `<`, `<=`, `>`, `>=` | Comparison | `orderDate > :startDate` |
| `BETWEEN` | Range | `orderDate BETWEEN :start AND :end` |
| `begins_with` | Prefix match | `orderDate begins_with :prefix` |

**Important constraint**: You can only use ONE partition key value per Query. To query multiple PK values, you need multiple Query calls (or a BatchGetItem, which we cover in Module 05).

## Composite Keys (PK + SK)

With a composite key like `(customerId, orderDate)`:

```
Partition: customerId="cust_1"
  ├── SK: "2024-01-15T10:30:00Z" → { orderId: "ord1", total: 34.98 }
  ├── SK: "2024-02-20T14:00:00Z" → { orderId: "ord2", total: 24.99 }
  └── SK: "2024-03-10T09:15:00Z" → { orderId: "ord3", total: 9.99 }
Partition: customerId="cust_2"
  └── SK: "2024-01-20T08:00:00Z" → { ... }
```

This design lets you efficiently query all orders for a customer, optionally filtered by date range.

## ScanIndexForward

Controls sort order:
- `ScanIndexForward: true` (default) → ascending (oldest orders first)
- `ScanIndexForward: false` → descending (newest orders first)

## Scan — The Full Table Sweep

Scan reads every item in the table in sequence. On a 1GB table... it reads all 1GB. This is why you should almost never use Scan in a request path.

**FilterExpression on Scan**: Filters are applied AFTER the read. If your table has 10,000 items and your filter matches 5, you still pay for reading all 10,000 items.

## Pagination

DynamoDB limits a single Query/Scan response to **1MB** of data. If more items match, DynamoDB returns `LastEvaluatedKey` — use this as `ExclusiveStartKey` on the next request to continue.

You can also use `Limit` to cap the number of items returned per page. This is how you implement "Show 10 per page" in your UI.

```typescript
// Fetching page by page
let lastKey: Record<string, unknown> | undefined;
do {
  const result = await query({ ExclusiveStartKey: lastKey, Limit: 10 });
  // Process result.Items...
  lastKey = result.LastEvaluatedKey;
} while (lastKey);
```

## Parallel Scan (conceptual)

For large Scan operations, DynamoDB supports segmented parallel scans using `Segment` and `TotalSegments` parameters. Each worker scans a different segment of the table. This is mainly for analytics/ETL use cases.

## What You'll Practice

1. Query all orders for a customer
2. Query orders in a date range with KeyConditionExpression
3. Query with begins_with on the sort key
4. Full table Scan (and observe how much data was read)
5. FilterExpression on top of Query and Scan
6. Paginate through results with Limit and ExclusiveStartKey

## Key Gotchas

- **Query NEEDS the exact partition key** — you cannot do `PK begins_with "cust"` or `PK > "cust_1"`
- **FilterExpression doesn't save RCU on Scan** — you pay for ALL items scanned, even filtered-out ones
- **LastEvaluatedKey is the only pagination mechanism** — no "page 3 of 10" style offsets
- **Query can only access one partition per call** — scatter/gather across partitions requires multiple queries
- **Begins_with only works on sort keys** (and string attributes in FilterExpression)
