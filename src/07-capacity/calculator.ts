/**
 * DynamoDB Capacity & Cost Calculator.
 *
 * All formulas based on AWS official documentation:
 * - 1 RCU = 1 strongly consistent read of up to 4KB per second
 *   (or 2 eventually consistent reads of up to 4KB per second)
 * - 1 WCU = 1 write of up to 1KB per second
 * - Items larger than the base unit consume multiple capacity units
 */

// ─── Capacity units ──────────────────────────────────────────────

/** RCU needed for a single read of a given item size and consistency */
export function rcuPerRead(
  itemSizeKB: number,
  consistent = false,
): number {
  const units = Math.ceil(itemSizeKB / 4);
  return consistent ? units : units / 2;
}

/** WCU needed for a single write of a given item size */
export function wcuPerWrite(itemSizeKB: number): number {
  return Math.ceil(itemSizeKB / 1);
}

/** Provisioned WCU needed to sustain a given write throughput */
export function wcuForWriteThroughput(
  writesPerSecond: number,
  avgItemSizeKB: number,
): number {
  return writesPerSecond * wcuPerWrite(avgItemSizeKB);
}

/** Provisioned RCU needed to sustain a given read throughput */
export function rcuForReadThroughput(
  readsPerSecond: number,
  avgItemSizeKB: number,
  consistent = false,
): number {
  return readsPerSecond * rcuPerRead(avgItemSizeKB, consistent);
}

// ─── Cost estimation ─────────────────────────────────────────────

/** Pricing per region (USD) — eu-west-2 defaults */
const PRICING = {
  /** Per WCU per hour (provisioned) */
  wcuPerHour: 0.00065 / 10, // $0.00065 per WCU-hour (sold in blocks of 10?)
  /** Per RCU per hour (provisioned) */
  rcuPerHour: 0.00013 / 10,
  /** Per million write request units (on-demand) */
  onDemandWritePerMillion: 1.25,
  /** Per million read request units (on-demand) */
  onDemandReadPerMillion: 0.25,
  /** GB-month for stored data */
  storagePerGBMonth: 0.25,
  /** GB-month for backups (continuous / PITR) */
  backupPerGBMonth: 0.20,
  /** GB restored from PITR */
  restorePerGB: 0.15,
  /** GB-month for global table replicated writes */
  globalTablePerMillion: 1.875,
};

const HOURS_PER_MONTH = 730;

/**
 * Estimate monthly cost for provisioned capacity.
 */
export function estimateProvisionedMonthlyCost(params: {
  readCapacityUnits: number;
  writeCapacityUnits: number;
  storageGB?: number;
  backupGB?: number;
}): {
  readCost: number;
  writeCost: number;
  storageCost: number;
  backupCost: number;
  total: number;
} {
  const readCost =
    params.readCapacityUnits * PRICING.rcuPerHour * HOURS_PER_MONTH;
  const writeCost =
    params.writeCapacityUnits * PRICING.wcuPerHour * HOURS_PER_MONTH;
  const storageCost = (params.storageGB ?? 0) * PRICING.storagePerGBMonth;
  const backupCost = (params.backupGB ?? 0) * PRICING.backupPerGBMonth;

  return {
    readCost: round(readCost),
    writeCost: round(writeCost),
    storageCost: round(storageCost),
    backupCost: round(backupCost),
    total: round(readCost + writeCost + storageCost + backupCost),
  };
}

/**
 * Estimate monthly cost for on-demand capacity.
 */
export function estimateOnDemandMonthlyCost(params: {
  readsPerMonth: number;
  writesPerMonth: number;
  avgReadSizeKB?: number;
  avgWriteSizeKB?: number;
  storageGB?: number;
}): {
  readCost: number;
  writeCost: number;
  storageCost: number;
  total: number;
} {
  const readUnits =
    params.readsPerMonth *
    Math.ceil((params.avgReadSizeKB ?? 4) / 4);
  const writeUnits =
    params.writesPerMonth *
    Math.ceil((params.avgWriteSizeKB ?? 1) / 1);

  const readCost =
    (readUnits / 1_000_000) * PRICING.onDemandReadPerMillion;
  const writeCost =
    (writeUnits / 1_000_000) * PRICING.onDemandWritePerMillion;
  const storageCost = (params.storageGB ?? 0) * PRICING.storagePerGBMonth;

  return {
    readCost: round(readCost),
    writeCost: round(writeCost),
    storageCost: round(storageCost),
    total: round(readCost + writeCost + storageCost),
  };
}

/**
 * Compare provisioned vs on-demand for a given workload.
 * Returns which is cheaper and by how much.
 */
export function compareCapacityModes(params: {
  readsPerSecond: number;
  writesPerSecond: number;
  avgItemSizeKB: number;
  consistentReads?: boolean;
  storageGB?: number;
}): {
  provisioned: ReturnType<typeof estimateProvisionedMonthlyCost>;
  onDemand: ReturnType<typeof estimateOnDemandMonthlyCost>;
  recommendation: string;
  savings: number;
} {
  const rcu = rcuForReadThroughput(
    params.readsPerSecond,
    params.avgItemSizeKB,
    params.consistentReads,
  );
  const wcu = wcuForWriteThroughput(
    params.writesPerSecond,
    params.avgItemSizeKB,
  );

  const readsPerMonth = params.readsPerSecond * 86_400 * 30;
  const writesPerMonth = params.writesPerSecond * 86_400 * 30;

  const provisioned = estimateProvisionedMonthlyCost({
    readCapacityUnits: rcu,
    writeCapacityUnits: wcu,
    storageGB: params.storageGB,
  });

  const onDemand = estimateOnDemandMonthlyCost({
    readsPerMonth,
    writesPerMonth,
    avgReadSizeKB: params.avgItemSizeKB,
    avgWriteSizeKB: params.avgItemSizeKB,
    storageGB: params.storageGB,
  });

  const cheaper = provisioned.total < onDemand.total ? "provisioned" : "on-demand";
  const savings = round(Math.abs(provisioned.total - onDemand.total));

  const recommendation =
    cheaper === "provisioned"
      ? `Provisioned is $${savings}/month cheaper for this steady workload`
      : `On-demand is $${savings}/month cheaper for this variable workload`;

  return { provisioned, onDemand, recommendation, savings };
}

// ─── Break-even analysis ─────────────────────────────────────────

/**
 * Find the requests-per-second at which provisioned becomes cheaper than on-demand.
 *
 * Provisioned costs scale linearly with capacity units.
 * On-demand costs scale linearly with request count.
 * The break-even is the throughput where the two cost models cross.
 */
export function provisionedBreakEven(params: {
  avgItemSizeKB: number;
  operation: "read" | "write";
  consistentRead?: boolean;
}): number {
  if (params.operation === "write") {
    // WCU: provisioned = wcu * 0.00065 * 730, on-demand = req/s * 86400 * 30 * 1.25/1e6
    // Break even when provisioned cost = on-demand cost
    const onDemandCostPerWrite =
      (1.25 / 1_000_000) * Math.ceil(params.avgItemSizeKB / 1);
    const provisionedCostPerWriteUnit = 0.00065 * 730; // per WCU per month
    return round(
      provisionedCostPerWriteUnit /
        onDemandCostPerWrite /
        86_400 /
        30,
    );
  } else {
    const readUnits = params.consistentRead
      ? Math.ceil(params.avgItemSizeKB / 4)
      : Math.ceil(params.avgItemSizeKB / 4) / 2;
    const onDemandCostPerRead =
      (0.25 / 1_000_000) * readUnits;
    const provisionedCostPerReadUnit = 0.00013 * 730;
    return round(
      provisionedCostPerReadUnit /
        onDemandCostPerRead /
        86_400 /
        30,
    );
  }
}

// ─── Formatting ───────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatCapacityBreakdown(params: {
  readsPerSecond: number;
  writesPerSecond: number;
  avgItemSizeKB: number;
}): string {
  const rcu = rcuForReadThroughput(
    params.readsPerSecond,
    params.avgItemSizeKB,
  );
  const wcu = wcuForWriteThroughput(
    params.writesPerSecond,
    params.avgItemSizeKB,
  );

  return `
  Capacity Breakdown
  ═══════════════════
  Read load:  ${params.readsPerSecond} reads/s × ${params.avgItemSizeKB}KB items = ${rcu} RCU needed
  Write load: ${params.writesPerSecond} writes/s × ${params.avgItemSizeKB}KB items = ${wcu} WCU needed
  Total provisioned: ${rcu} RCU + ${wcu} WCU`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
