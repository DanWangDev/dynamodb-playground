import { z } from "zod";
import { isoDateString, positiveInt } from "../shared/validators";

const OrderItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: positiveInt,
  price: positiveInt,
});

export const CreateOrderSchema = z.object({
  customerId: z.string().min(1).max(100),
  orderDate: isoDateString,
  orderId: z.string().min(1).max(100),
  total: z.number().positive("Total must be positive"),
  status: z.enum(["PENDING", "SHIPPED", "DELIVERED"]),
  items: z.array(OrderItemSchema).min(1, "Order must have at least one item"),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
