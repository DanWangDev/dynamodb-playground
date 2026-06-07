# Module 07: Capacity & Cost Model

## What's in This Module

Understanding DynamoDB costs is critical for production use. This module explains capacity units, pricing models, and how to estimate and optimise your costs.

## 1. Capacity Units — RCU and WCU

DynamoDB capacity is measured in two unit types:

### Read Capacity Units (RCU)

| Read type | Per RCU | Rounding |
|-----------|---------|----------|
| Strongly consistent | 1 read of up to 4KB | `ceil(itemSize / 4KB)` |
| Eventually consistent | 2 reads of up to 4KB | `ceil(itemSize / 4KB) / 2` |

A 5KB item with strong consistency: `ceil(5/4) = 2 RCU`

### Write Capacity Units (WCU)

| Write type | Per WCU | Rounding |
|------------|---------|----------|
| Standard write | 1 write of up to 1KB | `ceil(itemSize / 1KB)` |
| Transactional write | 2 WCU per 1KB | `2 × ceil(itemSize / 1KB)` |

A 3KB item: `ceil(3/1) = 3 WCU` (standard) or `6 WCU` (transactional)

### Key formula

```
Provisioned RCU = reads_per_second × ceil(avg_item_KB / 4) × consistency_multiplier
Provisioned WCU = writes_per_second × ceil(avg_item_KB / 1)
```

## 2. Provisioned vs On-Demand

| | Provisioned | On-Demand |
|---|-------------|-----------|
| **Pricing** | Per capacity unit per hour | Per request |
| **Scaling** | Manual or auto-scaling | Automatic |
| **Best for** | Predictable, steady workloads | Variable, spiky, or unknown workloads |
| **Burstable** | Yes (up to 5 min of burst) | No (but handles any spike instantly) |
| **Throttling** | Throttles when exceeded | Rarely throttles (AWS manages capacity) |
| **Free tier** | 25 RCU + 25 WCU | 25 RCU + 25 WCU equivalent |

### When to use which

**Use provisioned when:**
- You have steady, predictable traffic
- You want predictable costs (no surprise bills)
- You need guaranteed latency at scale

**Use on-demand when:**
- Traffic is spiky or unpredictable
- You're launching a new app (unknown traffic patterns)
- You don't want to manage capacity

## 3. Free Tier

The DynamoDB free tier includes (per month, forever):

| Resource | Free allowance |
|----------|---------------|
| Storage | 25 GB |
| Read capacity | 25 RCU (provisioned) |
| Write capacity | 25 WCU (provisioned) |
| On-demand reads | Equivalent to 25 RCU of reads |
| On-demand writes | Equivalent to 25 WCU of writes |

25 RCU/WCU is enough for ~200 million requests per month with items under 1KB.

## 4. Cost Estimation

### Provisioned pricing (eu-west-2)

| Resource | Cost |
|----------|------|
| Write capacity | $0.00065 per WCU-hour |
| Read capacity | $0.00013 per RCU-hour |
| Storage | $0.25 per GB-month |
| Continuous backup (PITR) | $0.20 per GB-month |
| On-demand backup | $0.10 per GB-month |
| Restore from backup | $0.15 per GB restored |
| Global table replication | $1.875 per million replicated writes |

### On-demand pricing (eu-west-2)

| Resource | Cost |
|----------|------|
| Write request | $1.25 per million write request units |
| Read request | $0.25 per million read request units |
| Storage | $0.25 per GB-month |

### Example: Small production app

| Parameter | Value |
|-----------|-------|
| Reads/second | 100 |
| Writes/second | 25 |
| Avg item size | 2KB |
| Storage | 50GB |

**Provisioned:**
- RCU = 100 × ceil(2/4) = 100 RCU
- WCU = 25 × ceil(2/1) = 50 WCU
- Read cost: 100 × $0.00013 × 730h = **$9.49/month**
- Write cost: 50 × $0.00065 × 730h = **$23.73/month**
- Storage: 50 × $0.25 = **$12.50/month**
- **Total: ~$45.72/month**

**On-demand:**
- Reads/month: 100 × 86,400 × 30 = 259M reads
- Writes/month: 25 × 86,400 × 30 = 64.8M writes
- Read cost: 259M × $0.25/1M = **$64.80/month**
- Write cost: 64.8M × $1.25/1M = **$81.00/month**
- Storage: **$12.50/month**
- **Total: ~$158.30/month**

→ Provisioned is ~3.5x cheaper for this steady workload.

## 5. Burst Capacity & Adaptive Capacity

### Burst capacity

Provisioned tables accumulate "burst credits" during idle periods. When traffic spikes above provisioned capacity, DynamoDB uses these credits to absorb the burst for up to **5 minutes**. This gives auto-scaling time to react.

```
If you provision 100 RCU but only use 50 RCU averaged over a minute,
you accumulate credits that can be spent during a burst.
```

### Adaptive capacity

When a single partition key receives disproportionate traffic (a "hot" partition), DynamoDB can split the partition and allocate more throughput to it — but only if the total provisioned capacity supports it.

### Important

- Burst capacity does NOT apply to on-demand tables
- Adaptive capacity helps with hot partitions but can't exceed total provisioned throughput
- A single partition key can consume at most 3,000 RCU or 1,000 WCU

## 6. Monitoring & Alarms

### Key CloudWatch metrics

| Metric | What it tells you |
|--------|-------------------|
| `ConsumedReadCapacityUnits` | Actual RCU used |
| `ConsumedWriteCapacityUnits` | Actual WCU used |
| `ThrottledRequests` | Requests rejected due to insufficient capacity |
| `ReadThrottleEvents` / `WriteThrottleEvents` | Throttle events at the partition level |
| `AccountProvisionedReadCapacityUtilization` | Account-level utilisation |
| `AccountProvisionedWriteCapacityUtilization` | Account-level utilisation |

### Auto-scaling

DynamoDB auto-scaling can adjust provisioned capacity based on utilisation:

```yaml
# Auto-scaling configuration example
MinCapacity: 5
MaxCapacity: 400
TargetUtilization: 70%  # Scale up when utilisation > 70%
```

This means you only pay for what you actually use during low-traffic periods while maintaining headroom for spikes.

## What You'll Practice

1. Read consumed capacity from real queries and see how item size affects it
2. Calculate provisioned capacity needs for given workloads
3. Compare provisioned vs on-demand costs
4. Run the cost calculator for different scenarios
5. Learn the break-even point between pricing models

## Key Gotchas

- **The 4KB / 1KB rounding matters** — a 4.1KB item costs 2 RCU to read, not 1.025. Always round UP.
- **Strong consistency costs 2x** — eventual consistency is half the RCU cost. Use it when you can tolerate it.
- **Transactional writes cost 2x WCU** — the atomicity guarantee isn't free.
- **Global secondary indexes have their own capacity** — a write to the base table also writes to GSIs, consuming additional WCU.
- **Indexes use eventual consistency by default** — LSIs can be strongly consistent, GSIs cannot.
- **Auto-scaling takes minutes to react** — a sudden 10x spike in traffic may still throttle before auto-scaling kicks in.
- **Free tier in eu-west-2 uses the same limits** — 25GB storage + 25 RCU/WCU across all tables in the region.
