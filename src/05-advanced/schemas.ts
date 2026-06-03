import { z } from "zod";
import { positiveInt, nonNegativeInt } from "../shared/validators";

export const CreateInventorySchema = z.object({
  productId: z.string().min(1).max(100),
  stock: nonNegativeInt,
});

export const CreateSessionSchema = z.object({
  sessionId: z.string().min(1).max(200),
  userId: z.string().min(1).max(100),
  data: z.record(z.unknown()).default({}),
  ttlSeconds: positiveInt, // how many seconds until expiry
});

export const UpdateUserProfileSchema = z.object({
  userId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  expectedVersion: nonNegativeInt,
});

export interface CreateInventoryInput {
  productId: string;
  stock: number;
}

export interface CreateSessionInput {
  sessionId: string;
  userId: string;
  data?: Record<string, unknown>;
  ttlSeconds: number;
}

export interface UpdateUserProfileInput {
  userId: string;
  name: string;
  email: string;
  expectedVersion: number;
}
