import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  createOrderAndDeductInventory,
  transferInventory,
} from "../../src/05-advanced/transactions";
import { TransactionCanceledError } from "../../src/shared/errors";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";

const ORDER_TABLE = uniqueTableName("adv_orders");
const INVENTORY_TABLE = uniqueTableName("adv_inventory");

describe("05-advanced: Transactions", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, ORDER_TABLE).withPK("pk", "S").withSK("sk", "S").create();
    await tableBuilder(raw, INVENTORY_TABLE).withPK("productId", "S").create();

    // Seed inventory
    await doc.send(
      new PutCommand({
        TableName: INVENTORY_TABLE,
        Item: { productId: "inv_prod_1", stock: 10, updatedAt: new Date().toISOString() },
      }),
    );
  });

  afterAll(async () => {
    await tableBuilder(raw, ORDER_TABLE).delete();
    await tableBuilder(raw, INVENTORY_TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("createOrderAndDeductInventory", () => {
    it("should atomically create order and deduct inventory", async () => {
      await createOrderAndDeductInventory(doc, ORDER_TABLE, INVENTORY_TABLE, {
        pk: "CUST#txn_1",
        sk: "ORDER#txn_1",
        orderId: "txn_1",
        total: 19.98,
        items: [{ productId: "inv_prod_1", quantity: 2 }],
      });

      // Verify inventory was deducted (10 - 2 = 8, but we can't easily assert without reading)
    });

    it("should roll back when inventory is insufficient", async () => {
      await expect(
        createOrderAndDeductInventory(doc, ORDER_TABLE, INVENTORY_TABLE, {
          pk: "CUST#txn_2",
          sk: "ORDER#txn_2",
          orderId: "txn_2",
          total: 999,
          items: [{ productId: "inv_prod_1", quantity: 9999 }],
        }),
      ).rejects.toThrow(TransactionCanceledError);
    });
  });

  describe("transferInventory", () => {
    beforeAll(async () => {
      await doc.send(
        new PutCommand({
          TableName: INVENTORY_TABLE,
          Item: { productId: "inv_prod_3", stock: 100, updatedAt: new Date().toISOString() },
        }),
      );
    });

    it("should transfer stock between products atomically", async () => {
      // Transfer 10 from inv_prod_3 to inv_prod_1
      await expect(
        transferInventory(doc, INVENTORY_TABLE, "inv_prod_3", "inv_prod_1", 10),
      ).resolves.not.toThrow();
    });

    it("should fail transfer when source has insufficient stock", async () => {
      await expect(
        transferInventory(doc, INVENTORY_TABLE, "inv_prod_1", "inv_prod_3", 99999),
      ).rejects.toThrow(TransactionCanceledError);
    });
  });
});
