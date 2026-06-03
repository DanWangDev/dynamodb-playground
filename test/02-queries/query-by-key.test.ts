import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  queryOrdersByCustomer,
  queryOrdersByDateRange,
  queryOrdersFromDate,
  queryOrdersByDatePrefix,
} from "../../src/02-queries/query-by-key";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { expectSortedByDate } from "../helpers/assertions";
import { generateTestOrders } from "./fixtures";

const TABLE = uniqueTableName("orders_query");

describe("02-queries: Query by Key", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE)
      .withPK("customerId", "S")
      .withSK("orderDate", "S")
      .create();

    // Seed: 15 orders for cust_0, 5 for cust_1
    const orders = [
      ...generateTestOrders("cust_0", 15),
      ...generateTestOrders("cust_1", 5),
    ];
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

  describe("queryOrdersByCustomer", () => {
    it("should return all orders for a customer", async () => {
      const result = await queryOrdersByCustomer(doc, TABLE, "cust_0");
      expect(result.items.length).toBe(15);
    });

    it("should return empty for a customer with no orders", async () => {
      const result = await queryOrdersByCustomer(doc, TABLE, "cust_99");
      expect(result.items.length).toBe(0);
    });

    it("should return items sorted by orderDate ascending by default", async () => {
      const result = await queryOrdersByCustomer(doc, TABLE, "cust_0");
      expectSortedByDate(result.items, "orderDate", true);
    });

    it("should support descending sort order", async () => {
      const result = await queryOrdersByCustomer(doc, TABLE, "cust_0", {
        ascending: false,
      });
      expectSortedByDate(result.items, "orderDate", false);
    });

    it("should respect Limit", async () => {
      const result = await queryOrdersByCustomer(doc, TABLE, "cust_0", {
        limit: 3,
      });
      expect(result.items.length).toBe(3);
      expect(result.hasMore).toBe(true);
      expect(result.lastEvaluatedKey).toBeDefined();
    });
  });

  describe("queryOrdersByDateRange", () => {
    it("should filter by date range (BETWEEN)", async () => {
      const result = await queryOrdersByDateRange(
        doc,
        TABLE,
        "cust_0",
        "2024-01-01T00:00:00Z",
        "2024-03-31T23:59:59Z",
      );
      // All orders in Q1
      expect(result.items.length).toBeGreaterThan(0);
      for (const order of result.items) {
        const d = new Date(order.orderDate);
        expect(d.getMonth()).toBeLessThanOrEqual(2); // Jan-Mar = months 0-2
      }
    });
  });

  describe("queryOrdersFromDate", () => {
    it("should return orders from a date onwards", async () => {
      const result = await queryOrdersFromDate(
        doc,
        TABLE,
        "cust_0",
        "2024-06-01T00:00:00Z",
      );
      for (const order of result.items) {
        expect(new Date(order.orderDate) >= new Date("2024-06-01")).toBe(true);
      }
    });
  });

  describe("queryOrdersByDatePrefix", () => {
    it("should filter by date prefix (begins_with)", async () => {
      const result = await queryOrdersByDatePrefix(
        doc,
        TABLE,
        "cust_0",
        "2024-01",
      );
      for (const order of result.items) {
        expect(order.orderDate.startsWith("2024-01")).toBe(true);
      }
    });
  });
});
