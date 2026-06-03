import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  queryOrdersByTotal,
  queryMostExpensiveOrders,
} from "../../src/03-indexes/lsi-queries";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import { generateOrdersForIndexTests } from "./fixtures";

const TABLE = uniqueTableName("orders_lsi");

describe("03-indexes: LSI Queries", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE)
      .withPK("customerId", "S")
      .withSK("orderDate", "S")
      .withLSI("total-index", "total", "N")
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

  describe("queryOrdersByTotal", () => {
    it("should return orders sorted by total ascending", async () => {
      const result = await queryOrdersByTotal(doc, TABLE, "cust_idx_0");
      expect(result.items.length).toBe(3);

      // Verify ascending order by total
      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i]!.total).toBeGreaterThanOrEqual(
          result.items[i - 1]!.total,
        );
      }
    });

    it("should filter by minimum total", async () => {
      const result = await queryOrdersByTotal(doc, TABLE, "cust_idx_0", 50);
      expect(result.items.length).toBe(2);
      for (const order of result.items) {
        expect(order.total).toBeGreaterThanOrEqual(50);
      }
    });

    it("should filter by total range", async () => {
      const result = await queryOrdersByTotal(
        doc,
        TABLE,
        "cust_idx_0",
        10,
        100,
      );
      expect(result.items.length).toBe(2);
      // 15.0 and 50.0 are in range, 120.0 is not
    });
  });

  describe("queryMostExpensiveOrders", () => {
    it("should return orders sorted by total descending", async () => {
      const result = await queryMostExpensiveOrders(
        doc,
        TABLE,
        "cust_idx_0",
        0,
      );
      expect(result.items.length).toBe(3);

      // Verify descending
      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i]!.total).toBeLessThanOrEqual(
          result.items[i - 1]!.total,
        );
      }
    });
  });
});
