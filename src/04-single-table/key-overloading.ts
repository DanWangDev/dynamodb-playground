import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { KEY_PATTERNS, GSI1_PATTERNS } from "./design";
import type { User, Order, Product, Review, AnyEntity } from "./types";

/**
 * Create a user profile in the single table.
 *
 * Uses composite PK: USER#<userId>, SK: PROFILE
 */
export async function createUser(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  name: string,
  email: string,
): Promise<User> {
  const user: User = {
    pk: KEY_PATTERNS.USER_PK(userId),
    sk: KEY_PATTERNS.USER_SK,
    gsi1Pk: GSI1_PATTERNS.USER,
    gsi1Sk: email,
    entityType: "USER",
    name,
    email,
    joinedAt: new Date().toISOString(),
  };

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: user,
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );

  return user;
}

/**
 * Create an order in the single table.
 *
 * Uses composite PK: USER#<userId>, SK: ORDER#<orderId>
 * The order lives in the same partition as the user — one Query gets both.
 */
export async function createOrder(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  orderId: string,
  orderDate: string,
  total: number,
  status: "PENDING" | "SHIPPED" | "DELIVERED",
  items: Array<{ productId: string; name: string; quantity: number; price: number }>,
): Promise<Order> {
  const order: Order = {
    pk: KEY_PATTERNS.ORDER_PK(userId),
    sk: KEY_PATTERNS.ORDER_SK(orderId),
    gsi1Pk: GSI1_PATTERNS.ORDER,
    gsi1Sk: orderDate,
    entityType: "ORDER",
    customerId: userId,
    orderDate,
    total,
    status,
    items,
  };

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: order,
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );

  return order;
}

/**
 * Create a product in the single table.
 */
export async function createProduct(
  doc: DynamoDBDocumentClient,
  tableName: string,
  productId: string,
  name: string,
  price: number,
  stock: number,
  category: string,
): Promise<Product> {
  const product: Product = {
    pk: KEY_PATTERNS.PRODUCT_PK(productId),
    sk: KEY_PATTERNS.PRODUCT_SK,
    gsi1Pk: GSI1_PATTERNS.PRODUCT,
    gsi1Sk: name,
    entityType: "PRODUCT",
    name,
    price,
    stock,
    category,
  };

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: product,
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );

  return product;
}

/**
 * Create a review for a product.
 * Reviews live in the PRODUCT partition — one Query gets the product + all its reviews.
 */
export async function createReview(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  productId: string,
  reviewId: string,
  rating: number,
  comment: string,
): Promise<Review> {
  const now = new Date().toISOString();
  const review: Review = {
    pk: KEY_PATTERNS.REVIEW_PK(productId),
    sk: KEY_PATTERNS.REVIEW_SK(reviewId),
    gsi1Pk: GSI1_PATTERNS.REVIEW,
    gsi1Sk: now,
    entityType: "REVIEW",
    productId,
    userId,
    rating,
    comment,
    createdAt: now,
  };

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: review,
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );

  return review;
}

/**
 * Get a user AND all their orders in ONE query.
 *
 * This is the killer feature of single-table design:
 * One Query returns the user profile + all orders.
 *
 * Query: PK = USER#<userId>
 * Returns: [PROFILE, ORDER#ord1, ORDER#ord2, ...]
 */
export async function getUserWithOrders(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<{ user: User | null; orders: Order[] }> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": KEY_PATTERNS.USER_PK(userId) },
    }),
  );

  const items = (result.Items ?? []) as AnyEntity[];

  const user = items.find((i) => i.entityType === "USER") as User | undefined;
  const orders = items.filter((i) => i.entityType === "ORDER") as Order[];

  return {
    user: user ?? null,
    orders,
  };
}

/**
 * Get a product and all its reviews in ONE query.
 *
 * Query: PK = PRODUCT#<productId>
 * Returns: [DETAILS, REVIEW#rev1, REVIEW#rev2, ...]
 */
export async function getProductWithReviews(
  doc: DynamoDBDocumentClient,
  tableName: string,
  productId: string,
): Promise<{ product: Product | null; reviews: Review[] }> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": KEY_PATTERNS.PRODUCT_PK(productId),
      },
    }),
  );

  const items = (result.Items ?? []) as AnyEntity[];

  const product = items.find((i) => i.entityType === "PRODUCT") as
    | Product
    | undefined;
  const reviews = items.filter((i) => i.entityType === "REVIEW") as Review[];

  return {
    product: product ?? null,
    reviews,
  };
}
