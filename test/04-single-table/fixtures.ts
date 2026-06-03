export const testUsers = {
  alice: { userId: "test_alice", name: "Alice Test", email: "alice@test.com" },
  bob: { userId: "test_bob", name: "Bob Test", email: "bob@test.com" },
};

export const testProducts = {
  widget: {
    productId: "test_p1",
    name: "Test Widget",
    price: 9.99,
    stock: 100,
    category: "Test Category",
  },
  gadget: {
    productId: "test_p2",
    name: "Test Gadget",
    price: 24.99,
    stock: 50,
    category: "Test Category",
  },
};

export const testOrders = {
  aliceOrder1: {
    userId: "test_alice",
    orderId: "test_ord_1",
    orderDate: "2024-01-15T10:30:00Z",
    total: 34.98,
    status: "DELIVERED" as const,
    items: [
      { productId: "test_p1", name: "Test Widget", quantity: 2, price: 9.99 },
    ],
  },
  aliceOrder2: {
    userId: "test_alice",
    orderId: "test_ord_2",
    orderDate: "2024-02-20T14:00:00Z",
    total: 24.99,
    status: "PENDING" as const,
    items: [
      { productId: "test_p2", name: "Test Gadget", quantity: 1, price: 24.99 },
    ],
  },
};

export const testReviews = {
  aliceWidgetReview: {
    userId: "test_alice",
    productId: "test_p1",
    reviewId: "test_rev_1",
    rating: 5,
    comment: "Great test widget!",
  },
};
