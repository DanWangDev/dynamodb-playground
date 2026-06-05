import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  // Omit DDB_ENDPOINT to use real AWS DynamoDB (cloud).
  // Set to http://localhost:8000 for the local dynalite emulator.
  DDB_ENDPOINT: z.string().url().optional(),
  DDB_PORT: z.string().default("8000"),
  AWS_REGION: z.string().default("eu-west-2"),
  // Omit both AWS_* keys to use the default AWS credential chain
  // (env vars, ~/.aws/credentials, IAM roles).
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DDB_TABLE_PREFIX: z.string().default("playground_"),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Environment validation failed. Check your .env file.");
  }
  return result.data;
}

export const env = parseEnv();
