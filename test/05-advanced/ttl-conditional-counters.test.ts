import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createExpiringSession, getSession, isSessionExpired, futureTtl } from "../../src/05-advanced/ttl";
import {
  createUserProfile,
  updateUserProfileOptimistic,
} from "../../src/05-advanced/conditional-writes";
import {
  incrementViews,
  likeArticle,
  getArticleStats,
} from "../../src/05-advanced/atomic-counters";
import { ConditionalCheckError } from "../../src/shared/errors";
import { createTestClient, uniqueTableName } from "../helpers/client";
import { tableBuilder } from "../helpers/table-builder";

const SESSION_TABLE = uniqueTableName("adv_sessions");
const PROFILE_TABLE = uniqueTableName("adv_profiles");
const STATS_TABLE = uniqueTableName("adv_stats");

describe("05-advanced: TTL, Conditional Writes, Atomic Counters", () => {
  const { raw, doc } = createTestClient();

  beforeAll(async () => {
    await tableBuilder(raw, SESSION_TABLE).withPK("sessionId", "S").create();
    await tableBuilder(raw, PROFILE_TABLE).withPK("userId", "S").create();
    await tableBuilder(raw, STATS_TABLE).withPK("articleId", "S").create();
  });

  afterAll(async () => {
    await tableBuilder(raw, SESSION_TABLE).delete();
    await tableBuilder(raw, PROFILE_TABLE).delete();
    await tableBuilder(raw, STATS_TABLE).delete();
    raw.destroy();
    doc.destroy();
  });

  describe("TTL", () => {
    it("should create a session with a future TTL", async () => {
      const session = await createExpiringSession(
        doc,
        SESSION_TABLE,
        "ttl_test_1",
        "alice",
        { cart: ["p1"] },
        3600,
      );

      expect(session.sessionId).toBe("ttl_test_1");
      expect(session.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(isSessionExpired(session)).toBe(false);
    });

    it("should retrieve an existing session", async () => {
      const session = await getSession(doc, SESSION_TABLE, "ttl_test_1");
      expect(session).not.toBeNull();
      expect(session!.userId).toBe("alice");
    });

    it("should return null for non-existent session", async () => {
      const session = await getSession(doc, SESSION_TABLE, "ttl_test_nonexistent");
      expect(session).toBeNull();
    });

    it("should correctly identify expired sessions", async () => {
      const expiredSession = await createExpiringSession(
        doc,
        SESSION_TABLE,
        "ttl_test_expired",
        "bob",
        {},
        -1,
      );
      expect(isSessionExpired(expiredSession)).toBe(true);
    });

    it("futureTtl should return a future timestamp", () => {
      const now = Math.floor(Date.now() / 1000);
      const ttl = futureTtl(300);
      expect(ttl).toBeGreaterThan(now);
      expect(ttl).toBeLessThanOrEqual(now + 301);
    });
  });

  describe("Conditional Writes / Optimistic Locking", () => {
    it("should create a user profile with version 0", async () => {
      const profile = await createUserProfile(
        doc,
        PROFILE_TABLE,
        "cond_user_1",
        "Alice",
        "alice@test.com",
      );
      expect(profile.version).toBe(0);
      expect(profile.name).toBe("Alice");
    });

    it("should reject duplicate profile creation", async () => {
      await expect(
        createUserProfile(doc, PROFILE_TABLE, "cond_user_1", "Alice 2", "alice2@test.com"),
      ).rejects.toThrow(ConditionalCheckError);
    });

    it("should update with correct version", async () => {
      const updated = await updateUserProfileOptimistic(
        doc,
        PROFILE_TABLE,
        "cond_user_1",
        "Alice Updated",
        "alice-new@test.com",
        0,
      );
      expect(updated.version).toBe(1);
      expect(updated.name).toBe("Alice Updated");
    });

    it("should reject update with wrong version", async () => {
      await expect(
        updateUserProfileOptimistic(
          doc,
          PROFILE_TABLE,
          "cond_user_1",
          "Alice Conflict",
          "alice-conflict@test.com",
          0, // should be 1 now
        ),
      ).rejects.toThrow(ConditionalCheckError);
    });
  });

  describe("Atomic Counters", () => {
    it("should increment views from scratch (item doesn't exist yet)", async () => {
      const views = await incrementViews(doc, STATS_TABLE, "counter_article_1");
      expect(views).toBe(1);
    });

    it("should increment views on an existing item", async () => {
      const views = await incrementViews(doc, STATS_TABLE, "counter_article_1", 5);
      expect(views).toBe(6);
    });

    it("should like an article", async () => {
      const likes = await likeArticle(doc, STATS_TABLE, "counter_article_1");
      expect(likes).toBe(1);
    });

    it("should get current article stats", async () => {
      const stats = await getArticleStats(doc, STATS_TABLE, "counter_article_1");
      expect(stats).not.toBeNull();
      expect(stats!.views).toBe(6);
      expect(stats!.likes).toBe(1);
    });

    it("should handle concurrent increments correctly", async () => {
      const results = await Promise.all([
        incrementViews(doc, STATS_TABLE, "counter_article_2"),
        incrementViews(doc, STATS_TABLE, "counter_article_2"),
        incrementViews(doc, STATS_TABLE, "counter_article_2"),
      ]);

      // All increments should have completed — each gets back the value after its ADD
      expect(results.length).toBe(3);

      const stats = await getArticleStats(doc, STATS_TABLE, "counter_article_2");
      expect(stats!.views).toBe(3); // Three +1 increments
    });
  });
});
