import { z } from "zod";
import { positiveInt, nonNegativeInt, isoDateString } from "../shared/validators";

export const CreateUserSchema = z.object({
  userId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  email: z.string().email(),
});

export const CreateOrderSchema = z.object({
  userId: z.string().min(1).max(100),
  orderId: z.string().min(1).max(100),
  orderDate: isoDateString,
  total: z.number().positive(),
  status: z.enum(["PENDING", "SHIPPED", "DELIVERED"]),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        name: z.string().min(1),
        quantity: positiveInt,
        price: positiveInt,
      }),
    )
    .min(1),
});

export const CreateProductSchema = z.object({
  productId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  price: z.number().positive(),
  stock: nonNegativeInt,
  category: z.string().min(1).max(100),
});

export const CreateReviewSchema = z.object({
  userId: z.string().min(1).max(100),
  productId: z.string().min(1).max(100),
  reviewId: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1).max(1000),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
