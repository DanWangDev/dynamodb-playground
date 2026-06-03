/** Domain types for advanced features (Module 05) */

export interface InventoryItem {
  productId: string;
  stock: number;
  reserved: number;
  updatedAt: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  data: Record<string, unknown>;
  createdAt: number; // epoch seconds
  ttl: number; // epoch seconds — DynamoDB TTL attribute
}

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  version: number; // optimistic locking version
  updatedAt: string;
}

export interface ArticleStats {
  articleId: string;
  title: string;
  views: number; // atomic counter
  likes: number; // atomic counter
}

/** A DynamoDB Stream record */
export interface StreamRecord {
  eventID: string;
  eventName: "INSERT" | "MODIFY" | "REMOVE";
  eventVersion: string;
  eventSource: string;
  awsRegion: string;
  dynamodb: {
    Keys: Record<string, unknown>;
    OldImage?: Record<string, unknown>;
    NewImage?: Record<string, unknown>;
    SequenceNumber: string;
    SizeBytes: number;
    StreamViewType: string;
  };
}
