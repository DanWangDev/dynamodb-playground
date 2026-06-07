import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";
import {
  createStreamDemoItem,
  updateStreamDemoItem,
  deleteStreamDemoItem,
} from "../../src/06-streams/operations";
import { handler } from "../../src/06-streams/lambda-handler";
import { CreateStreamDemoSchema, UpdateStreamDemoSchema } from "../../src/06-streams/schemas";
import type { DynamoDBStreamEvent } from "../../src/06-streams/types";
import {
  validStreamItem,
  minimalStreamItem,
  testUpdate,
  invalidInputs,
} from "./fixtures";

const TABLE = uniqueTableName("stream_demo");

describe("06-streams: Operations", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, TABLE)
      .withPK("pk", "S")
      .withSK("sk", "S")
      .create();
  });

  afterAll(async () => {
    await tableBuilder(raw, TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("Input Validation", () => {
    it("should accept a valid create input", () => {
      const result = CreateStreamDemoSchema.safeParse(validStreamItem);
      expect(result.success).toBe(true);
    });

    it("should accept a minimal create input", () => {
      const result = CreateStreamDemoSchema.safeParse(minimalStreamItem);
      expect(result.success).toBe(true);
    });

    it("should accept a valid update input", () => {
      const result = UpdateStreamDemoSchema.safeParse(testUpdate);
      expect(result.success).toBe(true);
    });

    it("should reject an empty partition key", () => {
      const result = CreateStreamDemoSchema.safeParse(invalidInputs.emptyPk);
      expect(result.success).toBe(false);
    });

    it("should reject an empty sort key", () => {
      const result = CreateStreamDemoSchema.safeParse(invalidInputs.emptySk);
      expect(result.success).toBe(false);
    });

    it("should reject empty data", () => {
      const result = CreateStreamDemoSchema.safeParse(invalidInputs.emptyData);
      expect(result.success).toBe(false);
    });
  });

  describe("CRUD Operations (works everywhere)", () => {
    it("should create a stream demo item", async () => {
      const item = await createStreamDemoItem(doc, TABLE, validStreamItem);
      expect(item.pk).toBe(validStreamItem.pk);
      expect(item.sk).toBe(validStreamItem.sk);
      expect(item.data).toBe(validStreamItem.data);
      expect(item.counter).toBe(0);
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
    });

    it("should update an item with new data and increment counter", async () => {
      const updated = await updateStreamDemoItem(doc, TABLE, testUpdate);
      expect(updated).not.toBeNull();
      expect(updated!.data).toBe("Updated data");
      expect(updated!.counter).toBe(1); // started at 0, incremented by 1
    });

    it("should increment counter only without changing data", async () => {
      const updated = await updateStreamDemoItem(doc, TABLE, {
        pk: "test_cat",
        sk: "test_item_1",
        incrementBy: 3,
      });
      expect(updated).not.toBeNull();
      expect(updated!.counter).toBe(4); // was 1, +3 = 4
      expect(updated!.data).toBe("Updated data"); // unchanged
    });

    it("should delete an item", async () => {
      await deleteStreamDemoItem(doc, TABLE, "test_cat", "test_item_1");
      // Item should be gone (no error = success)
    });

    it("should not throw when deleting a non-existent item", async () => {
      // DynamoDB DeleteItem is idempotent — deleting a missing item is a no-op
      await expect(
        deleteStreamDemoItem(doc, TABLE, "nonexistent", "item"),
      ).resolves.not.toThrow();
    });
  });
});

describe("06-streams: Lambda Handler (unit tests)", () => {
  const makeEvent = (records: DynamoDBStreamEvent["Records"]): DynamoDBStreamEvent => ({
    Records: records,
  });

  const makeRecord = (
    eventName: "INSERT" | "MODIFY" | "REMOVE",
    keys: Record<string, unknown>,
  ): DynamoDBStreamEvent["Records"][0] => ({
    eventID: `evt_${Math.random().toString(36).slice(2, 8)}`,
    eventName,
    eventVersion: "1.1",
    eventSource: "aws:dynamodb",
    awsRegion: "eu-west-2",
    dynamodb: {
      Keys: keys,
      NewImage: eventName !== "REMOVE" ? { pk: keys.pk, sk: keys.sk, data: "test" } : undefined,
      OldImage: eventName !== "INSERT" ? { pk: keys.pk, sk: keys.sk, data: "old" } : undefined,
      SequenceNumber: "100000000000000000001",
      SizeBytes: 42,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    },
    eventSourceARN: "arn:aws:dynamodb:eu-west-2:123456789012:table/test/stream",
  });

  it("should process INSERT records without failures", async () => {
    const event = makeEvent([
      makeRecord("INSERT", { pk: "cat1", sk: "item1" }),
      makeRecord("INSERT", { pk: "cat1", sk: "item2" }),
    ]);

    const result = await handler(event);
    expect(result.batchItemFailures).toHaveLength(0);
  });

  it("should process MODIFY records without failures", async () => {
    const event = makeEvent([
      makeRecord("MODIFY", { pk: "cat1", sk: "item1" }),
    ]);

    const result = await handler(event);
    expect(result.batchItemFailures).toHaveLength(0);
  });

  it("should process REMOVE records without failures", async () => {
    const event = makeEvent([
      makeRecord("REMOVE", { pk: "cat1", sk: "item1" }),
    ]);

    const result = await handler(event);
    expect(result.batchItemFailures).toHaveLength(0);
  });

  it("should handle mixed event types in one batch", async () => {
    const event = makeEvent([
      makeRecord("INSERT", { pk: "cat1", sk: "item1" }),
      makeRecord("MODIFY", { pk: "cat2", sk: "item_a" }),
      makeRecord("REMOVE", { pk: "cat3", sk: "item_x" }),
    ]);

    const result = await handler(event);
    expect(result.batchItemFailures).toHaveLength(0);
  });

  it("should return empty batchItemFailures on empty batch", async () => {
    const event = makeEvent([]);

    const result = await handler(event);
    expect(result.batchItemFailures).toHaveLength(0);
  });
});
