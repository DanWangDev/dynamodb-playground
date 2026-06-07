# Module 08: Production Features — Global Tables, PITR, Backups & DAX

## What's in This Module

Three production-grade DynamoDB features that go beyond single-region, single-table operations:

1. **Global Tables** — multi-region, multi-active replication
2. **Point-in-Time Recovery (PITR) & Backups** — data protection and disaster recovery
3. **DAX (DynamoDB Accelerator)** — in-memory read cache for microsecond latency

These features require production AWS accounts and can't be fully exercised in a playground. This module explains the concepts, architecture, and configuration patterns so you know how they work and when to use them.

---

## 1. Global Tables

### What They Are

Global Tables replicate a DynamoDB table across multiple AWS regions automatically. Every region can read AND write — there is no primary/secondary distinction.

```
         ┌──────────┐
         │ eu-west-2│  (London)
         │ Table v2 │
         └────┬─────┘
              │  replication
    ┌─────────┼─────────┐
    │         │         │
┌───┴───┐ ┌───┴───┐ ┌───┴───┐
│us-east│ │ap-se-1│ │eu-cntl│
│ Table │ │ Table │ │ Table │
└───────┘ └───────┘ └───────┘
```

### Key Properties

| Property | Detail |
|----------|--------|
| Multi-active | Any region can read and write — no primary/replica |
| Conflict resolution | Last-writer-wins based on timestamp |
| Replication lag | Typically < 1 second |
| Max regions | Any number of regions |
| Cost | $1.875 per million replicated writes + standard table costs per region |
| Streams required | Must have streams enabled (NEW_AND_OLD_IMAGES) |

### When to Use

**Yes — use Global Tables when:**
- You need low-latency access from multiple geographic regions
- You need disaster recovery with near-zero RPO/RTO
- You need active-active multi-region architecture

**No — avoid Global Tables when:**
- Your app is single-region (use a regular table)
- You need strong consistency across regions (last-writer-wins may surprise you)
- Write conflicts are common and business-logic resolution is needed

### Configuration

```typescript
// Enable global table on an existing table (via AWS CLI)
// aws dynamodb update-table \
//   --table-name playground_orders \
//   --replica-updates '[{"Create": {"RegionName": "us-east-1"}}]'

// List replicas
// aws dynamodb describe-table \
//   --table-name playground_orders \
//   --query "Table.Replicas"
```

### Gotchas

- **Last-writer-wins** — if two regions write to the same item at the same time, the later timestamp wins. This can silently overwrite data.
- **Streams are mandatory** — you can't enable global tables without enabling DynamoDB Streams first.
- **Cost adds up** — you pay for writes in EVERY region, plus replication traffic.
- **GSI replication** — GSIs are replicated but their data takes additional time to propagate.

---

## 2. Point-in-Time Recovery (PITR) & Backups

### PITR (Continuous Backup)

PITR continuously backs up your table to a point in the last **35 days**. You can restore to any second within that window.

| Property | Detail |
|----------|--------|
| Retention | 35 days |
| Granularity | Per-second |
| Cost | $0.20 per GB-month |
| Restore time | Proportional to table size |
| Restore target | New table (never overwrites original) |

### On-Demand Backups

Snapshots that persist until you delete them — no expiration.

| Property | Detail |
|----------|--------|
| Retention | Forever (until explicitly deleted) |
| Cost | $0.10 per GB-month |
| Consistency | Eventually consistent (snapshot of the table at a point in time) |
| Restore target | New table |

### Enabling PITR

```typescript
// Enable PITR
// aws dynamodb update-continuous-backups \
//   --table-name playground_orders \
//   --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true

// Create on-demand backup
// aws dynamodb create-backup \
//   --table-name playground_orders \
//   --backup-name orders-backup-2024-01-01

// Restore from PITR (to a specific second)
// aws dynamodb restore-table-to-point-in-time \
//   --source-table-name playground_orders \
//   --target-table-name playground_orders_restored \
//   --restore-date-time 2024-01-01T12:00:00Z

// Restore from backup
// aws dynamodb restore-table-from-backup \
//   --target-table-name playground_orders_restored \
//   --backup-arn <backup-arn>
```

### Backup Strategy

| Strategy | When to use |
|----------|-------------|
| PITR only | Production tables where 35-day window is sufficient |
| On-demand only | Pre-deployment snapshots, compliance archives |
| PITR + on-demand | Production tables needing both rolling recovery + long-term archives |
| Cross-region copy | Disaster recovery (copy backup to another region with `aws dynamodb copy-backup`) |

### Gotchas

- **Restore creates a NEW table** — you can't restore in-place. The new table has a different name and you need to switch your app to use it.
- **Restored table has no auto-scaling** — provisioned capacity settings are restored, but auto-scaling policies are NOT. You need to reconfigure them.
- **PITR is not enabled by default** — you must explicitly enable it on every table that needs it.
- **GSIs are included in the restore** — but LSI data might take additional time.

---

## 3. DAX (DynamoDB Accelerator)

### What It Is

DAX is an in-memory cache cluster that sits between your application and DynamoDB. It caches reads and writes, reducing latency from single-digit milliseconds to **microseconds**.

```
App ──→ DAX Cluster ──→ DynamoDB
         (cache)          (source)
          ↑
     microsecond reads
     (if cached)
```

### Performance

| Operation | Without DAX | With DAX (cached) |
|-----------|------------|-------------------|
| GetItem | 5-10 ms | < 100 μs |
| Query | 5-15 ms | < 500 μs |
| Write (write-through) | 5-10 ms | 5-10 ms (pass-through) |

### Architecture

```
         ┌──────────────┐
         │   DAX Client │  (embedded in your app)
         └──────┬───────┘
                │
    ┌───────────┼───────────┐
    │           │           │
┌───┴───┐   ┌───┴───┐   ┌───┴───┐
│ Node 1│   │ Node 2│   │ Node 3│   (DAX cluster in your VPC)
│ Cache │   │ Cache │   │ Cache │
└───┬───┘   └───┬───┘   └───┬───┘
    │           │           │
    └───────────┼───────────┘
                │
         ┌──────┴──────┐
         │  DynamoDB   │
         └─────────────┘
```

### Key Properties

| Property | Detail |
|----------|--------|
| Cache type | Write-through (writes go to DAX then DynamoDB) |
| Consistency | Eventually consistent reads from cache, strongly consistent reads go to DynamoDB |
| TTL | Configurable per-item (default 5 min) |
| Cluster size | 1-10 nodes |
| Node types | t2.small to r5.8xlarge |
| Encryption | At-rest and in-transit supported |
| VPC | DAX runs in your VPC (not publicly accessible) |

### When to Use

**Yes — use DAX when:**
- You need microsecond read latency
- Your workload is read-heavy with repeatable queries
- You're already using DynamoDB and latency is the bottleneck

**No — avoid DAX when:**
- Your workload is write-heavy (DAX doesn't accelerate writes)
- Your queries are unique (no cache hits — DAX adds latency for misses)
- You need strongly consistent reads (bypass DAX)
- You're using on-demand capacity (DAX needs provisioned capacity analysis)
- You can solve it with application-level caching (ElastiCache, CloudFront, etc.)

### Gotchas

- **DAX is expensive** — a 3-node t2.small cluster costs ~$250/month minimum.
- **Not a replacement for good data modeling** — DAX masks poor access patterns but doesn't fix them.
- **VPC-locked** — DAX runs in your VPC. Lambda functions outside the VPC can't access it without VPC configuration.
- **Strongly consistent reads bypass DAX** — they go straight to DynamoDB, adding latency.
- **DAX is regional only** — it doesn't replicate across regions (use Global Tables for that).
- **No free tier** — unlike DynamoDB, DAX has no free tier.

---

## What You'll Practice

1. Explore the Global Tables API (list replicas, describe global table settings)
2. Enable PITR on a table and list backups
3. Understand DAX architecture and when to use it vs application-level caching
4. Review the cost implications of each feature

## Key Decision Framework

| Requirement | Solution |
|-------------|----------|
| Multi-region low-latency reads & writes | Global Tables |
| Accidental delete/overwrite recovery | PITR (restore to second before the mistake) |
| Compliance/audit long-term retention | On-demand backups |
| Microsecond read latency | DAX |
| Disaster recovery (single region) | PITR + cross-region backup copy |
| Disaster recovery (multi-region) | Global Tables + PITR in each region |
