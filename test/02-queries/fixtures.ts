import type { CreateOrderInput } from "../../src/02-queries/schemas";

export const sampleOrder: CreateOrderInput = {
  customerId: "test_cust_0",
  orderDate: "2024-01-15T10:30:00Z",
  orderId: "test_ord_1",
  total: 34.98,
  status: "PENDING",
  items: [{ name: "Widget", quantity: 2, price: 17.49 }],
};

export function generateTestOrders(
  customerId: string,
  count: number,
): CreateOrderInput[] {
  return Array.from({ length: count }, (_, i) => ({
    customerId,
    orderDate: new Date(2024, i % 12, (i % 28) + 1).toISOString(),
    orderId: `test_ord_${customerId}_${i}`,
    total: Math.round((10 + i * 15.5) * 100) / 100,
    status: (i % 3 === 0 ? "PENDING" : i % 3 === 1 ? "SHIPPED" : "DELIVERED") as CreateOrderInput["status"],
    items: [{ name: `Product ${i}`, quantity: i + 1, price: 9.99 }],
  }));
}
