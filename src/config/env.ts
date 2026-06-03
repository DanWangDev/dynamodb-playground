import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  DDB_ENDPOINT: z.string().url().default("http://localhost:8000"),
  DDB_PORT: z.string().default("8000"),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().default("local"),
  AWS_SECRET_ACCESS_KEY: z.string().default("local"),
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
