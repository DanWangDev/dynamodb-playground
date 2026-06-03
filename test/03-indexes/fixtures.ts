import type { CreateOrderInput } from "../../src/03-indexes/schemas";

export function generateOrdersForIndexTests(): CreateOrderInput[] {
  return [
    // customerId, orderDate, orderId, total, status, items, discountCode?
    {
      customerId: "cust_idx_0",
      orderDate: "2024-01-10T10:00:00Z",
      orderId: "ord_low_1",
      total: 15.0,
      status: "PENDING",
      items: [{ name: "Budget Item", quantity: 1, price: 15.0 }],
    },
    {
      customerId: "cust_idx_0",
      orderDate: "2024-02-15T14:00:00Z",
      orderId: "ord_med_2",
      total: 50.0,
      status: "SHIPPED",
      items: [{ name: "Mid Item", quantity: 2, price: 25.0 }],
      discountCode: "SAVE10",
    },
    {
      customerId: "cust_idx_0",
      orderDate: "2024-03-20T09:00:00Z",
      orderId: "ord_high_3",
      total: 120.0,
      status: "DELIVERED",
      items: [{ name: "Premium Item", quantity: 1, price: 120.0 }],
      discountCode: "VIP50",
    },
    {
      customerId: "cust_idx_1",
      orderDate: "2024-01-05T08:30:00Z",
      orderId: "ord_c1_1",
      total: 25.0,
      status: "PENDING",
      items: [{ name: "Item X", quantity: 1, price: 25.0 }],
    },
    {
      customerId: "cust_idx_1",
      orderDate: "2024-04-10T16:00:00Z",
      orderId: "ord_c1_2",
      total: 75.0,
      status: "DELIVERED",
      items: [{ name: "Item Y", quantity: 3, price: 25.0 }],
    },
    {
      customerId: "cust_idx_2",
      orderDate: "2024-05-01T12:00:00Z",
      orderId: "ord_c2_1",
      total: 200.0,
      status: "SHIPPED",
      items: [{ name: "Bulk Pack", quantity: 10, price: 20.0 }],
      discountCode: "BULK20",
    },
  ];
}
