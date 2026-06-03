import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  queryOrdersByStatus,
  queryRecentOrdersByStatus,
  queryHighValueOrdersByStatus,
} from "../../src/03-indexes/gsi-queries";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { generateOrdersForIndexTests } from "./fixtures";

const TABLE = uniqueTableName("orders_gsi");

describe("03-indexes: GSI Queries", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE)
      .withPK("customerId", "S")
      .withSK("orderDate", "S")
      .withGSI("status-index", "status", "S", "orderDate", "S")
      .create();

    const orders = generateOrdersForIndexTests();
    for (const order of orders) {
      await doc.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            ...order,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      );
    }
  });

  afterAll(async () => {
    await tableBuilder(raw, TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("queryOrdersByStatus", () => {
    it("should return all orders with a given status across all customers", async () => {
      const result = await queryOrdersByStatus(doc, TABLE, "PENDING");
      expect(result.items.length).toBe(2); // two PENDING orders in fixtures
      for (const order of result.items) {
        expect(order.status).toBe("PENDING");
      }
    });

    it("should return results from multiple customers", async () => {
      const result = await queryOrdersByStatus(doc, TABLE, "DELIVERED");
      const customers = new Set(result.items.map((o) => o.customerId));
      expect(customers.size).toBeGreaterThanOrEqual(1);
    });

    it("should return empty for a status with no orders", async () => {
      const result = await queryOrdersByStatus(
        doc,
        TABLE,
        "CANCELLED" as never,
      );
      expect(result.items.length).toBe(0);
    });
  });

  describe("queryRecentOrdersByStatus", () => {
    it("should respect the limit parameter", async () => {
      const result = await queryRecentOrdersByStatus(doc, TABLE, "PENDING", 1);
      expect(result.items.length).toBe(1);
    });

    it("should return orders sorted by date descending", async () => {
      const result = await queryRecentOrdersByStatus(
        doc,
        TABLE,
        "PENDING",
        10,
      );
      if (result.items.length > 1) {
        const first = new Date(result.items[0]!.orderDate).getTime();
        const second = new Date(result.items[1]!.orderDate).getTime();
        expect(first).toBeGreaterThanOrEqual(second);
      }
    });
  });

  describe("queryHighValueOrdersByStatus", () => {
    it("should filter by minimum total after index query", async () => {
      const result = await queryHighValueOrdersByStatus(
        doc,
        TABLE,
        "PENDING",
        20,
      );
      for (const order of result.items) {
        expect(order.total).toBeGreaterThan(20);
      }
    });
  });
});
