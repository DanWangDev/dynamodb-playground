import type { CreateInventoryInput, CreateSessionInput, UpdateUserProfileInput } from "../../src/05-advanced/schemas";

export const testInventory: CreateInventoryInput[] = [
  { productId: "adv_prod_1", stock: 100 },
  { productId: "adv_prod_2", stock: 50 },
];

export const testSessions: CreateSessionInput[] = [
  { sessionId: "adv_session_1", userId: "alice", data: { cart: ["p1"] }, ttlSeconds: 3600 },
  { sessionId: "adv_session_2", userId: "bob", data: {}, ttlSeconds: 60 },
];

export const testUserProfile: UpdateUserProfileInput = {
  userId: "adv_user_1",
  name: "Alice Advanced",
  email: "alice@test.com",
  expectedVersion: 0,
};
