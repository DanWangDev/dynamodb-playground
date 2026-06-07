import type { CreateStreamDemoInput, UpdateStreamDemoInput } from "../../src/06-streams/types";

export const validStreamItem: CreateStreamDemoInput = {
  pk: "test_cat",
  sk: "test_item_1",
  data: "Test stream data",
  counter: 0,
};

export const minimalStreamItem: CreateStreamDemoInput = {
  pk: "test_cat",
  sk: "test_item_2",
  data: "Minimal item",
};

export const testStreamItems: CreateStreamDemoInput[] = [
  { pk: "test_cat", sk: "item_a", data: "Item A" },
  { pk: "test_cat", sk: "item_b", data: "Item B" },
  { pk: "test_cat", sk: "item_c", data: "Item C" },
];

export const testUpdate: UpdateStreamDemoInput = {
  pk: "test_cat",
  sk: "test_item_1",
  data: "Updated data",
  incrementBy: 1,
};

export const invalidInputs = {
  emptyPk: { pk: "", sk: "item", data: "data" },
  emptySk: { pk: "pk", sk: "", data: "data" },
  emptyData: { pk: "pk", sk: "item", data: "" },
  missingData: { pk: "pk", sk: "item" },
};
