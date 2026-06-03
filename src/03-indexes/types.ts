/** Types for the Orders table with secondary indexes (Module 03) */

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
  /** Only present on some orders — used for sparse index demo */
  discountCode?: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = "PENDING" | "SHIPPED" | "DELIVERED";
