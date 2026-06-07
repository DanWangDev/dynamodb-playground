import { z } from "zod";
import { partitionKey, sortKey } from "../shared/validators";

export const CreateStreamDemoSchema = z.object({
  pk: partitionKey,
  sk: sortKey,
  data: z.string().min(1).max(1000),
  counter: z.number().int().min(0).default(0),
});

export const UpdateStreamDemoSchema = z.object({
  pk: z.string().min(1),
  sk: z.string().min(1),
  data: z.string().min(1).max(1000).optional(),
  incrementBy: z.number().int().min(1).max(100).optional(),
});

export type CreateStreamDemoInput = z.infer<typeof CreateStreamDemoSchema>;
export type UpdateStreamDemoInput = z.infer<typeof UpdateStreamDemoSchema>;
