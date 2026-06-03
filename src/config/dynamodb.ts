import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Env } from "./env";

export interface DynamoDBConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface DynamoDBClients {
  raw: DynamoDBClient;
  doc: DynamoDBDocumentClient;
}

export function createDynamoDBClient(config: DynamoDBConfig): DynamoDBClients {
  const raw = new DynamoDBClient({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const doc = DynamoDBDocumentClient.from(raw, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertEmptyValues: false,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  });

  return { raw, doc };
}

export function createClientFromEnv(env: Env): DynamoDBClients {
  return createDynamoDBClient({
    endpoint: env.DDB_ENDPOINT,
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  });
}
