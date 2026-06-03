/**
 * Deterministic seed data generators for tests.
 * All generators produce predictable output — no random values —
 * to ensure tests are not flaky.
 */

export interface SeedOptions {
  /** Prefix applied to generated values to identify test data */
  prefix?: string;
}

const defaults: Required<SeedOptions> = {
  prefix: "test",
};

export function resolveOptions(options?: SeedOptions): Required<SeedOptions> {
  return options ? { ...defaults, ...options } : defaults;
}

/** Generate a batch of book items */
export function generateBooks(count: number, opts?: SeedOptions) {
  const { prefix } = resolveOptions(opts);
  return Array.from({ length: count }, (_, i) => ({
    isbn: `978-${prefix}-${String(i).padStart(5, "0")}`,
    title: `${prefix} Book ${i}`,
    author: `Author ${i}`,
    pageCount: 100 + i * 10,
    tags: [`tag-${i % 5}`, `${prefix}`],
    published: new Date(2020 + (i % 5), i % 12, (i % 28) + 1).toISOString(),
    rating: (i % 5) + 1,
  }));
}

/** Generate a batch of order items */
export function generateOrders(
  customerCount: number,
  ordersPerCustomer: number,
  opts?: SeedOptions,
) {
  const { prefix } = resolveOptions(opts);
  const orders: Array<{
    customerId: string;
    orderDate: string;
    orderId: string;
    total: number;
    status: string;
    items: Array<{ name: string; quantity: number; price: number }>;
  }> = [];

  for (let c = 0; c < customerCount; c++) {
    for (let o = 0; o < ordersPerCustomer; o++) {
      orders.push({
        customerId: `${prefix}_cust_${c}`,
        orderDate: new Date(2024, o % 12, (o % 28) + 1).toISOString(),
        orderId: `${prefix}_order_${c}_${o}`,
        total: Math.round((50 + o * 25.5) * 100) / 100,
        status: o % 3 === 0 ? "PENDING" : o % 3 === 1 ? "SHIPPED" : "DELIVERED",
        items: [
          {
            name: `Product ${o}`,
            quantity: o + 1,
            price: Math.round((10 + o * 5.5) * 100) / 100,
          },
        ],
      });
    }
  }

  return orders;
}
