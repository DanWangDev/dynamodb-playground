import { z } from "zod";
import { isoDateString, nonNegativeInt } from "../shared/validators";

export const CreateBookSchema = z.object({
  isbn: z
    .string()
    .min(1, "ISBN is required")
    .max(20, "ISBN must be 20 characters or fewer"),
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title must be 500 characters or fewer"),
  author: z
    .string()
    .min(1, "Author is required")
    .max(200, "Author must be 200 characters or fewer"),
  pageCount: nonNegativeInt.optional(),
  tags: z.array(z.string().min(1)).min(1).max(50).optional(),
  published: isoDateString.optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export const UpdateBookSchema = z.object({
  isbn: z.string().min(1, "ISBN is required"),
  title: z.string().min(1).max(500).optional(),
  author: z.string().min(1).max(200).optional(),
  pageCount: nonNegativeInt.optional(),
  tags: z.array(z.string().min(1)).min(1).max(50).optional(),
  published: isoDateString.optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export type CreateBookInput = z.infer<typeof CreateBookSchema>;
export type UpdateBookInput = z.infer<typeof UpdateBookSchema>;
