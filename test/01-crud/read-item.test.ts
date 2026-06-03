import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createBook } from "../../src/01-crud/create-item";
import { getBook } from "../../src/01-crud/read-item";
import { ItemNotFoundError } from "../../src/shared/errors";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { validBook } from "./fixtures";

const TABLE = uniqueTableName("books_read");

describe("01-crud: Read Item", () => {
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

  it("should read a book by its ISBN", async () => {
    const book = await getBook(doc, TABLE, validBook.isbn);
    expect(book.isbn).toBe(validBook.isbn);
    expect(book.title).toBe(validBook.title);
    expect(book.author).toBe(validBook.author);
  });

  it("should return all attributes by default", async () => {
    const book = await getBook(doc, TABLE, validBook.isbn);
    expect(book.tags).toBeDefined();
    expect(book.rating).toBeDefined();
    expect(book.pageCount).toBeDefined();
    expect(book.createdAt).toBeDefined();
  });

  it("should return only projected attributes when ProjectionExpression is used", async () => {
    const book = await getBook(doc, TABLE, validBook.isbn, {
      projection: ["isbn", "title"],
    });

    expect(book.isbn).toBe(validBook.isbn);
    expect(book.title).toBe(validBook.title);
    // These should be undefined because they weren't projected
    expect(book.author).toBeUndefined();
    expect(book.rating).toBeUndefined();
  });

  it("should support strongly consistent reads", async () => {
    const book = await getBook(doc, TABLE, validBook.isbn, {
      consistent: true,
    });
    expect(book.isbn).toBe(validBook.isbn);
    // The read succeeded — we can't easily verify consistency level from the client side,
    // but the operation should not error
  });

  it("should throw ItemNotFoundError for non-existent ISBN", async () => {
    await expect(
      getBook(doc, TABLE, "978-0000000000"),
    ).rejects.toThrow(ItemNotFoundError);
  });
});
