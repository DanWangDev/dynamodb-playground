import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { scanAllOrders, scanOrdersByStatus } from "../../src/02-queries/scan";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { generateTestOrders } from "./fixtures";

const TABLE = uniqueTableName("orders_scan");

describe("02-queries: Scan", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE)
      .withPK("customerId", "S")
      .withSK("orderDate", "S")
      .create();

    const orders = [
      ...generateTestOrders("cust_0", 5),
      ...generateTestOrders("cust_1", 5),
      ...generateTestOrders("cust_2", 5),
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

  describe("scanAllOrders", () => {
    it("should return all items in the table", async () => {
      const result = await scanAllOrders(doc, TABLE);
      expect(result.items.length).toBe(15);
    });

    it("should support pagination with Limit", async () => {
      const page1 = await scanAllOrders(doc, TABLE, { limit: 5 });
      expect(page1.items.length).toBe(5);
      expect(page1.hasMore).toBe(true);

      const page2 = await scanAllOrders(doc, TABLE, {
        limit: 5,
        startKey: page1.lastEvaluatedKey,
      });
      expect(page2.items.length).toBe(5);
    });
  });

  describe("scanOrdersByStatus", () => {
    it("should return only orders with matching status", async () => {
      const result = await scanOrdersByStatus(doc, TABLE, "PENDING");
      expect(result.items.length).toBeGreaterThan(0);
      for (const order of result.items) {
        expect(order.status).toBe("PENDING");
      }
    });

    it("should return empty for status with no matches", async () => {
      // Our generator creates only PENDING/SHIPPED/DELIVERED — no "CANCELLED"
      const result = await scanOrdersByStatus(doc, TABLE, "CANCELLED" as never);
      expect(result.items.length).toBe(0);
    });
  });
});
