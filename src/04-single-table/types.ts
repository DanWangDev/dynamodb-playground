/** Domain types for the single-table e-commerce design (Module 04) */

export type EntityType = "USER" | "ORDER" | "PRODUCT" | "REVIEW";

export interface EcommerceItem {
  pk: string;
  sk: string;
  gsi1Pk: string;
  gsi1Sk: string;
  entityType: EntityType;
}

export interface User extends EcommerceItem {
  entityType: "USER";
  name: string;
  email: string;
  joinedAt: string;
}

export type OrderStatus = "PENDING" | "SHIPPED" | "DELIVERED";

export interface Order extends EcommerceItem {
  entityType: "ORDER";
  customerId: string;
  orderDate: string;
  total: number;
  status: OrderStatus;
  items: Array<{ productId: string; name: string; quantity: number; price: number }>;
}

export interface Product extends EcommerceItem {
  entityType: "PRODUCT";
  name: string;
  price: number;
  stock: number;
  category: string;
}

export interface Review extends EcommerceItem {
  entityType: "REVIEW";
  productId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export type AnyEntity = User | Order | Product | Review;
