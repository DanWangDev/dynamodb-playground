import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createBook } from "../../src/01-crud/create-item";
import { getBook } from "../../src/01-crud/read-item";
import {
  updateBook,
  addBookTag,
  removeBookAttribute,
} from "../../src/01-crud/update-item";
import { ItemNotFoundError } from "../../src/shared/errors";
import { UpdateBookSchema } from "../../src/01-crud/schemas";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { validBook } from "./fixtures";

const TABLE = uniqueTableName("books_update");

describe("01-crud: Update Item", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE).withPK("isbn", "S").create();
    await createBook(doc, TABLE, validBook);
  });

  afterAll(async () => {
    await tableBuilder(raw, TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("Input Validation", () => {
    it("should accept a valid update input", () => {
      const result = UpdateBookSchema.safeParse({
        isbn: validBook.isbn,
        title: "Updated Title",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an update with no ISBN", () => {
      const result = UpdateBookSchema.safeParse({
        title: "Missing ISBN",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateBook", () => {
    it("should update specific fields without affecting others", async () => {
      const updated = await updateBook(doc, TABLE, {
        isbn: validBook.isbn,
        title: "Updated DynamoDB Title",
        pageCount: 450,
      });

      expect(updated.title).toBe("Updated DynamoDB Title");
      expect(updated.pageCount).toBe(450);
      // Original fields should be preserved
      expect(updated.author).toBe(validBook.author);
      expect(updated.isbn).toBe(validBook.isbn);
    });

    it("should persist the update", async () => {
      const book = await getBook(doc, TABLE, validBook.isbn);
      expect(book.title).toBe("Updated DynamoDB Title");
      expect(book.pageCount).toBe(450);
    });

    it("should throw ItemNotFoundError for non-existent ISBN", async () => {
      await expect(
        updateBook(doc, TABLE, {
          isbn: "978-0000000000",
          title: "Ghost Book",
        }),
      ).rejects.toThrow(ItemNotFoundError);
    });
  });

  describe("addBookTag (ADD expression)", () => {
    it("should add a tag to the existing tags array", async () => {
      const book = await addBookTag(doc, TABLE, validBook.isbn, "new-tag");
      expect(book.tags).toContain("new-tag");
      // Original tags should still be there
      expect(book.tags).toContain("testing");
    });
  });

  describe("removeBookAttribute (REMOVE expression)", () => {
    it("should remove a specific attribute", async () => {
      await removeBookAttribute(doc, TABLE, validBook.isbn, "pageCount");

      const book = await getBook(doc, TABLE, validBook.isbn);
      expect(book.pageCount).toBeUndefined();
    });
  });
});
