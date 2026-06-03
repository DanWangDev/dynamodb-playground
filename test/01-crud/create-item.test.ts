import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CreateBookSchema } from "../../src/01-crud/schemas";
import { createBook, putBook } from "../../src/01-crud/create-item";
import { getBook } from "../../src/01-crud/read-item";
import { ValidationError } from "../../src/shared/errors";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { expectItemShape } from "../helpers/assertions";
import { validBook, minimalBook, invalidInputs, requiredBookKeys } from "./fixtures";

const TABLE = uniqueTableName("books_crud");

describe("01-crud: Create Item", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE).withPK("isbn", "S").create();
  });

  afterAll(async () => {
    await tableBuilder(raw, TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("Input Validation", () => {
    it("should accept a valid book input", () => {
      const result = CreateBookSchema.safeParse(validBook);
      expect(result.success).toBe(true);
    });

    it("should accept a minimal book (only required fields)", () => {
      const result = CreateBookSchema.safeParse(minimalBook);
      expect(result.success).toBe(true);
    });

    it("should reject an empty ISBN", () => {
      const result = CreateBookSchema.safeParse(invalidInputs.emptyIsbn);
      expect(result.success).toBe(false);
    });

    it("should reject a negative page count", () => {
      const result = CreateBookSchema.safeParse(invalidInputs.negativePageCount);
      expect(result.success).toBe(false);
    });

    it("should reject a rating outside 1-5 range", () => {
      const result = CreateBookSchema.safeParse(invalidInputs.invalidRating);
      expect(result.success).toBe(false);
    });

    it("should reject an invalid date format", () => {
      const result = CreateBookSchema.safeParse(invalidInputs.invalidDate);
      expect(result.success).toBe(false);
    });
  });

  describe("createBook (with condition)", () => {
    it("should create a book and return it with all required fields", async () => {
      const book = await createBook(doc, TABLE, validBook);

      expectItemShape(book, requiredBookKeys);
      expect(book.isbn).toBe(validBook.isbn);
      expect(book.title).toBe(validBook.title);
      expect(book.author).toBe(validBook.author);
      expect(book.createdAt).toBeTruthy();
      expect(book.updatedAt).toBeTruthy();
    });

    it("should persist the book in DynamoDB", async () => {
      const book = await getBook(doc, TABLE, validBook.isbn);
      expect(book.title).toBe(validBook.title);
    });

    it("should reject duplicate ISBN with ConditionalCheckFailedException", async () => {
      await expect(createBook(doc, TABLE, validBook)).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("putBook (without condition — upsert)", () => {
    it("should create a new book", async () => {
      const book = await putBook(doc, TABLE, minimalBook);
      expect(book.isbn).toBe(minimalBook.isbn);
      expect(book.title).toBe(minimalBook.title);
    });

    it("should overwrite an existing book entirely", async () => {
      // First, verify the minimal book has only certain fields
      const original = await getBook(doc, TABLE, minimalBook.isbn);
      expect(original.title).toBe(minimalBook.title);

      // Now overwrite with completely different data
      await putBook(doc, TABLE, {
        isbn: minimalBook.isbn,
        title: "Completely Different Title",
        author: "Different Author",
      });

      const overwritten = await getBook(doc, TABLE, minimalBook.isbn);
      expect(overwritten.title).toBe("Completely Different Title");
      expect(overwritten.author).toBe("Different Author");
      // pageCount was in the original but not in the overwrite — should be gone
      expect(overwritten.pageCount).toBeUndefined();
      expect(overwritten.tags).toBeUndefined();
    });
  });
});
