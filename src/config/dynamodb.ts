import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Env } from "./env";

export interface DynamoDBConfig {
  /** Omit to use the real AWS DynamoDB endpoint (cloud). Set to a local URL for dynalite. */
  endpoint?: string;
  region: string;
  /** Omit to use the default AWS credential chain (env vars, ~/.aws/credentials, IAM). */
  accessKeyId?: string;
  /** Omit to use the default AWS credential chain (env vars, ~/.aws/credentials, IAM). */
  secretAccessKey?: string;
}

export interface DynamoDBClients {
  raw: DynamoDBClient;
  doc: DynamoDBDocumentClient;
}

export function createDynamoDBClient(config: DynamoDBConfig): DynamoDBClients {
  const clientConfig: Record<string, unknown> = {
    region: config.region,
  };

  // Only set endpoint when targeting a local emulator — omit for real AWS cloud
  if (config.endpoint) {
    clientConfig["endpoint"] = config.endpoint;
  }

  // Only set explicit credentials when both values are provided — omit for
  // the default AWS credential chain (env vars, ~/.aws/credentials, IAM roles)
  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig["credentials"] = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  const raw = new DynamoDBClient(clientConfig as any);

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
