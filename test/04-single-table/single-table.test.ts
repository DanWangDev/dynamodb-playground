import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createUser,
  createOrder,
  createProduct,
  createReview,
  getUserWithOrders,
  getProductWithReviews,
} from "../../src/04-single-table/key-overloading";
import {
  getAllUsers,
  getAllProducts,
  getAllOrders,
  getOrder,
  getProduct,
} from "../../src/04-single-table/access-patterns";
import {
  filterByType,
  groupByType,
  isEntityType,
} from "../../src/04-single-table/entity-discrimination";
import { KEY_PATTERNS } from "../../src/04-single-table/design";
import type { AnyEntity, User, Order } from "../../src/04-single-table/types";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import {
  testUsers,
  testProducts,
  testOrders,
  testReviews,
} from "./fixtures";

const TABLE = uniqueTableName("ecom_single");

describe("04-single-table: Single-Table Design", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE)
      .withPK("pk", "S")
      .withSK("sk", "S")
      .withGSI("gsi1", "gsi1Pk", "S", "gsi1Sk", "S")
      .create();

    // Create test data
    await createUser(doc, TABLE, testUsers.alice.userId, testUsers.alice.name, testUsers.alice.email);
    await createUser(doc, TABLE, testUsers.bob.userId, testUsers.bob.name, testUsers.bob.email);
    await createProduct(doc, TABLE, testProducts.widget.productId, testProducts.widget.name, testProducts.widget.price, testProducts.widget.stock, testProducts.widget.category);
    await createProduct(doc, TABLE, testProducts.gadget.productId, testProducts.gadget.name, testProducts.gadget.price, testProducts.gadget.stock, testProducts.gadget.category);
    await createOrder(doc, TABLE, testOrders.aliceOrder1.userId, testOrders.aliceOrder1.orderId, testOrders.aliceOrder1.orderDate, testOrders.aliceOrder1.total, testOrders.aliceOrder1.status, testOrders.aliceOrder1.items);
    await createOrder(doc, TABLE, testOrders.aliceOrder2.userId, testOrders.aliceOrder2.orderId, testOrders.aliceOrder2.orderDate, testOrders.aliceOrder2.total, testOrders.aliceOrder2.status, testOrders.aliceOrder2.items);
    await createReview(doc, TABLE, testReviews.aliceWidgetReview.userId, testReviews.aliceWidgetReview.productId, testReviews.aliceWidgetReview.reviewId, testReviews.aliceWidgetReview.rating, testReviews.aliceWidgetReview.comment);
  });

  afterAll(async () => {
    await tableBuilder(raw, TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("Key structure", () => {
    it("should use correct PK/SK patterns", () => {
      expect(KEY_PATTERNS.USER_PK("alice")).toBe("USER#alice");
      expect(KEY_PATTERNS.USER_SK).toBe("PROFILE");
      expect(KEY_PATTERNS.ORDER_SK("ord1")).toBe("ORDER#ord1");
      expect(KEY_PATTERNS.PRODUCT_PK("p1")).toBe("PRODUCT#p1");
    });
  });

  describe("User + Orders in one query", () => {
    it("should return user and all their orders", async () => {
      const { user, orders } = await getUserWithOrders(
        doc,
        TABLE,
        testUsers.alice.userId,
      );
      expect(user).not.toBeNull();
      expect(user!.name).toBe(testUsers.alice.name);
      expect(orders.length).toBe(2);
    });
  });

  describe("Product + Reviews in one query", () => {
    it("should return product and its reviews", async () => {
      const { product, reviews } = await getProductWithReviews(
        doc,
        TABLE,
        testProducts.widget.productId,
      );
      expect(product).not.toBeNull();
      expect(product!.name).toBe(testProducts.widget.name);
      expect(reviews.length).toBe(1);
      expect(reviews[0]!.rating).toBe(5);
    });
  });

  describe("GSI overloading", () => {
    it("should get all users via GSI1", async () => {
      const result = await getAllUsers(doc, TABLE);
      expect(result.items.length).toBe(2);
      for (const user of result.items) {
        expect(user.entityType).toBe("USER");
      }
    });

    it("should get all products via GSI1", async () => {
      const result = await getAllProducts(doc, TABLE);
      expect(result.items.length).toBe(2);
      for (const product of result.items) {
        expect(product.entityType).toBe("PRODUCT");
      }
    });

    it("should get all orders via GSI1", async () => {
      const result = await getAllOrders(doc, TABLE);
      expect(result.items.length).toBe(2);
    });
  });

  describe("Direct GetItem", () => {
    it("should get a single order by exact keys", async () => {
      const order = await getOrder(
        doc,
        TABLE,
        testOrders.aliceOrder1.userId,
        testOrders.aliceOrder1.orderId,
      );
      expect(order).not.toBeNull();
      expect(order!.total).toBe(34.98);
    });

    it("should get a single product by exact keys", async () => {
      const product = await getProduct(doc, TABLE, testProducts.widget.productId);
      expect(product).not.toBeNull();
      expect(product!.name).toBe("Test Widget");
    });
  });

  describe("Entity discrimination", () => {
    it("should filter items by type", async () => {
      const { user, orders } = await getUserWithOrders(
        doc,
        TABLE,
        testUsers.alice.userId,
      );
      const allItems: AnyEntity[] = user ? [user, ...orders] : orders;

      const onlyOrders = filterByType<Order>(allItems, "ORDER");
      expect(onlyOrders.length).toBe(2);
      for (const order of onlyOrders) {
        expect(order.entityType).toBe("ORDER");
      }
    });

    it("should group items by type", () => {
      const items: AnyEntity[] = [
        { pk: "USER#1", sk: "PROFILE", entityType: "USER", gsi1Pk: "P", gsi1Sk: "e", name: "A", email: "a@b.com", joinedAt: "" },
        { pk: "USER#1", sk: "ORDER#1", entityType: "ORDER", gsi1Pk: "O", gsi1Sk: "d", customerId: "1", orderDate: "", total: 10, status: "PENDING", items: [] },
      ];

      const groups = groupByType(items);
      expect(groups.USER.length).toBe(1);
      expect(groups.ORDER.length).toBe(1);
    });

    it("should type-guard correctly", () => {
      const item: AnyEntity = {
        pk: "USER#1", sk: "PROFILE", entityType: "USER",
        gsi1Pk: "P", gsi1Sk: "e", name: "A", email: "a@b.com", joinedAt: "",
      };
      expect(isEntityType<User>(item, "USER")).toBe(true);
      expect(isEntityType<Order>(item, "ORDER")).toBe(false);
    });
  });
});
