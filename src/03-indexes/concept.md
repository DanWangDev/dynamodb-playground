# Module 03: Secondary Indexes

## The Problem Indexes Solve

Without indexes, you can only query by:
- **Primary Key** (GetItem, BatchGetItem)
- **Partition Key + optional Sort Key filter** (Query)

What if you need to find orders by status? Or by total amount? Without an index, you'd have to **Scan** the entire table — expensive and slow.

**Secondary indexes give you additional Query-able fields.**

## Two Types of Secondary Indexes

### Local Secondary Index (LSI)

| Property | Value |
|---|---|
| Partition Key | **Same** as the base table |
| Sort Key | **Different** than the base table |
| Created when | **Only at table creation time** (cannot add later) |
| Consistency | Supports **strongly consistent reads** |
| Size limit | Shares the partition's 10GB limit |
| Count limit | Max 5 LSIs per table |

**Use LSI when**: You want to query the same partition by a different sort order, and you need strong consistency.

Example: Orders table has PK=customerId, SK=orderDate. An LSI with SK=total lets you query "all orders for customer X, sorted by total."

### Global Secondary Index (GSI)

| Property | Value |
|---|---|
| Partition Key | **Can be different** from the base table |
| Sort Key | **Can be different** (optional) |
| Created when | **Anytime** — can add/remove after table creation |
| Consistency | **Eventually consistent only** |
| Size limit | Unlimited (separate partition space) |
| Throughput | Has its **own** provisioned capacity (or on-demand) |
| Count limit | Max 20 GSIs per table (default quota) |

**Use GSI when**: You need to query by a completely different attribute, or you need to create the index after the table already exists.

Example: A GSI on the Orders table with PK=status, SK=orderDate lets you query "all PENDING orders across all customers, sorted by date."

## Projections — What Data Goes Into the Index?

When you create an index, you choose which attributes are **projected** (copied) into it:

| Projection Type | What's in the index | Cost |
|---|---|---|
| `KEYS_ONLY` | Only the table PK + SK + index keys | Cheapest storage |
| `INCLUDE` | Keys + specified non-key attributes | Balance storage vs queries |
| `ALL` | All attributes from the base table | Most storage, simplest queries |

**The trade-off**: With `KEYS_ONLY`, you can only return the key attributes from an index query. To get other attributes, you need a second query to the base table (a "fetch"). With `ALL`, you pay more in storage but your index queries can return everything in one call.

## Sparse Indexes

A **sparse index** is an index where only SOME items appear — specifically, only items that have the indexed attribute. Items missing the attribute are not projected into the index at all.

This is a powerful pattern for:
- Finding items that have a certain optional attribute
- Creating a "not-yet-processed" queue (items with `processedAt` = absent)
- Filtering for "active" vs "archived" items

## Querying an Index

To query an index, specify `IndexName` on your Query command:

```typescript
await doc.send(new QueryCommand({
  TableName: "orders",
  IndexName: "status-index",    // ← Use the GSI instead of the base table
  KeyConditionExpression: "#status = :status",
  // ...
}));
```

## Capacity and Cost

- **LSI**: Shares read/write capacity with the base table. Querying an LSI consumes RCU from the table's pool.
- **GSI**: Has its own capacity. Querying a GSI consumes RCU from the GSI's pool (in provisioned mode) or independently (on-demand).

## What You'll Practice

1. Query orders by total using an LSI
2. Query all orders by status across customers using a GSI
3. Design a sparse index
4. Compare index query costs vs base table scans

## Key Gotchas

- **LSIs can ONLY be created at table creation time** — plan ahead
- **GSIs are eventually consistent** — reads may be stale (there's no ConsistentRead on GSI queries)
- **GSI key attributes MUST be present on the item** for it to appear in the index
- **Indexes cost money** — each GSI consumes additional storage and throughput
- **Index projection choice affects query patterns** — KEYS_ONLY means you may need follow-up GetItem calls
- **Deletes from base table are eventually consistent in GSIs** — an item may briefly remain visible in a GSI after being deleted
