import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  getOrdersPage,
  getAllOrdersForCustomer,
  forEachOrderPage,
} from "../../src/02-queries/pagination";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { expectPaginatedResult } from "../helpers/assertions";
import { generateTestOrders } from "./fixtures";

const TABLE = uniqueTableName("orders_paginate");

describe("02-queries: Pagination", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE)
      .withPK("customerId", "S")
      .withSK("orderDate", "S")
      .create();

    const orders = generateTestOrders("cust_pag", 12);
    for (const order of orders) {
      await doc.send(
        new PutCommand({
          TableName: TABLE,
          Item: { ...order, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        }),
      );
    }
  });

  afterAll(async () => {
    await tableBuilder(raw, TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("getOrdersPage", () => {
    it("should return a page of items with pagination metadata", async () => {
      const page = await getOrdersPage(doc, TABLE, "cust_pag", 5, undefined);
      expectPaginatedResult(page, 1);
      expect(page.items.length).toBe(5);
    });

    it("should support cursor-based pagination", async () => {
      const page1 = await getOrdersPage(doc, TABLE, "cust_pag", 5, undefined);
      expect(page1.items.length).toBe(5);
      expect(page1.hasMore).toBe(true);

      const page2 = await getOrdersPage(
        doc,
        TABLE,
        "cust_pag",
        5,
        page1.lastEvaluatedKey,
      );
      expect(page2.items.length).toBe(5);

      const page3 = await getOrdersPage(
        doc,
        TABLE,
        "cust_pag",
        5,
        page2.lastEvaluatedKey,
      );
      expect(page3.items.length).toBe(2); // 12 total, 5+5=10, remaining = 2
      expect(page3.hasMore).toBe(false);
    });
  });

  describe("getAllOrdersForCustomer", () => {
    it("should transparently fetch all items across all pages", async () => {
      const allOrders = await getAllOrdersForCustomer(doc, TABLE, "cust_pag", 3);
      expect(allOrders.length).toBe(12);
    });
  });

  describe("forEachOrderPage", () => {
    it("should iterate pages with a callback", async () => {
      const pageSizes: number[] = [];
      const total = await forEachOrderPage(
        doc,
        TABLE,
        "cust_pag",
        4,
        async (page, _idx) => {
          pageSizes.push(page.length);
        },
      );
      expect(total).toBe(12);
      expect(pageSizes.length).toBe(3); // 12 items / 4 per page = 3 pages
    });
  });
});
