import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createBook } from "../../src/01-crud/create-item";
import { getBook } from "../../src/01-crud/read-item";
import { deleteBook, deleteBookSilent } from "../../src/01-crud/delete-item";
import { ItemNotFoundError, ConditionalCheckError } from "../../src/shared/errors";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { validBook, minimalBook } from "./fixtures";

const TABLE = uniqueTableName("books_delete");

describe("01-crud: Delete Item", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE).withPK("isbn", "S").create();
    await createBook(doc, TABLE, validBook);
    await createBook(doc, TABLE, minimalBook);
  });

  afterAll(async () => {
    await tableBuilder(raw, TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("deleteBook (with condition)", () => {
    it("should delete a book and return the pre-deletion item", async () => {
      const deleted = await deleteBook(doc, TABLE, validBook.isbn);
      expect(deleted).not.toBeNull();
      expect(deleted!.isbn).toBe(validBook.isbn);
      expect(deleted!.title).toBe(validBook.title);

      // Verify it's actually gone
      await expect(getBook(doc, TABLE, validBook.isbn)).rejects.toThrow(
        ItemNotFoundError,
      );
    });

    it("should fail conditional delete when condition is not met", async () => {
      // minimalBook has no rating field — condition on rating should fail
      await expect(
        deleteBook(doc, TABLE, minimalBook.isbn, {
          conditionExpression: "#rating > :threshold",
          conditionNames: { "#rating": "rating" },
          conditionValues: { ":threshold": 3 },
        }),
      ).rejects.toThrow(ConditionalCheckError);

      // Verify the item still exists (wasn't deleted)
      const book = await getBook(doc, TABLE, minimalBook.isbn);
      expect(book).toBeDefined();
    });
  });

  describe("deleteBookSilent", () => {
    it("should silently succeed when deleting non-existent item", async () => {
      // Should not throw
      await expect(
        deleteBookSilent(doc, TABLE, "978-0000000000"),
      ).resolves.toBeUndefined();
    });

    it("should delete an existing item without returning it", async () => {
      await deleteBookSilent(doc, TABLE, minimalBook.isbn);

      await expect(getBook(doc, TABLE, minimalBook.isbn)).rejects.toThrow(
        ItemNotFoundError,
      );
    });
  });
});
