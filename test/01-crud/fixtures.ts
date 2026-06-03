import type { Book, CreateBookInput } from "../../src/01-crud/types";

/** Valid book creation input */
export const validBook: CreateBookInput = {
  isbn: "978-1234567890",
  title: "Test-Driven DynamoDB",
  author: "Jane Doe",
  pageCount: 300,
  tags: ["testing", "dynamodb"],
  rating: 4,
  published: "2024-06-01T00:00:00Z",
};

/** Minimal valid book (only required fields) */
export const minimalBook: CreateBookInput = {
  isbn: "978-0000000001",
  title: "Minimal Book",
  author: "Min Author",
};

/** Book with all optional fields */
export const fullBook: CreateBookInput = {
  isbn: "978-9999999999",
  title: "The Complete Guide to DynamoDB",
  author: "Alex DeBrie",
  pageCount: 600,
  tags: ["dynamodb", "aws", "nosql", "design", "advanced"],
  rating: 5,
  published: "2024-03-15T12:00:00Z",
};

/** Expected shape of a created book (keys that must exist) */
export const requiredBookKeys: (keyof Book)[] = [
  "isbn",
  "title",
  "author",
  "createdAt",
  "updatedAt",
];

/** Invalid inputs for validation testing */
export const invalidInputs = {
  emptyIsbn: { ...validBook, isbn: "" },
  noTitle: { ...validBook, title: "" } as unknown as CreateBookInput,
  noAuthor: { ...validBook, author: "" } as unknown as CreateBookInput,
  negativePageCount: { ...validBook, pageCount: -1 },
  invalidRating: { ...validBook, rating: 10 },
  invalidDate: { ...validBook, published: "not-a-date" },
  emptyTag: { ...validBook, tags: [""] },
};
