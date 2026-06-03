/** Domain types for the Orders table (Module 02: Queries & Scans) */

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  customerId: string;
  orderDate: string;
  orderId: string;
  total: number;
  status: "PENDING" | "SHIPPED" | "DELIVERED";
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  customerId: string;
  orderDate: string;
  orderId: string;
  total: number;
  status: "PENDING" | "SHIPPED" | "DELIVERED";
  items: OrderItem[];
}

export type OrderStatus = "PENDING" | "SHIPPED" | "DELIVERED";
