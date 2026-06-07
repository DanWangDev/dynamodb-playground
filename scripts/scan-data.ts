/**
 * Interactive table data browser.
 *
 * Usage:
 *   npm run db:scan               interactive: pick table, browse with pagination
 *   npm run db:scan <table>       browse a specific table directly
 *   npm run db:scan -- --raw      raw JSON dump (old behavior)
 *
 * In interactive mode, press Enter for next page, 'q' to quit.
 */

import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { createClientFromEnv } from "../src/config/dynamodb";
import { env } from "../src/config/env";
import * as readline from "readline";

const PREFIX = env.DDB_TABLE_PREFIX;
const PAGE_SIZE = 10;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rawMode = args.includes("--raw");
  const tableFilter = rawMode ? args.filter((a) => a !== "--raw") : args;
  const { raw, doc } = createClientFromEnv(env);

  if (rawMode) {
    await rawScan(doc, tableFilter);
    raw.destroy();
    doc.destroy();
    return;
  }

  const tables = await listTables(doc);
  if (tables.length === 0) {
    console.log("No playground tables found. Run: npm run setup");
    raw.destroy();
    doc.destroy();
    return;
  }

  const target = tableFilter.length > 0
    ? tables.find((t) => t.name === ensurePrefix(tableFilter[0]))
    : null;

  if (target) {
    await browseTable(raw, doc, target.name);
  } else if (tableFilter.length > 0) {
    console.log(`Table "${ensurePrefix(tableFilter[0])}" not found.`);
    console.log(`Available tables: ${tables.map((t) => t.name).join(", ")}`);
  } else {
    await interactivePicker(raw, doc, tables);
  }

  raw.destroy();
}

// ─── Table listing ──────────────────────────────────────────────

async function listTables(doc: DynamoDBDocumentClient): Promise<{ name: string; count: number }[]> {
  // We know the tables from setup — just check which exist
  const known = [
    "books", "orders", "ecommerce", "sessions",
    "inventory", "profiles", "stats", "stream_demo",
  ];

  const tables: { name: string; count: number }[] = [];
  for (const name of known) {
    const tableName = `${PREFIX}${name}`;
    try {
      const scan = await doc.send(
        new ScanCommand({ TableName: tableName, Limit: 1, Select: "COUNT" }),
      );
      tables.push({ name: tableName, count: scan.Count ?? 0 });
    } catch {
      // Table doesn't exist — skip
    }
  }

  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Interactive picker ─────────────────────────────────────────

async function interactivePicker(
  raw: DynamoDBClient,
  doc: DynamoDBDocumentClient,
  tables: { name: string; count: number }[],
): Promise<void> {
  console.log("\n📊 Playground Tables\n");
  tables.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name.padEnd(30)} ${String(t.count).padStart(4)} items`);
  });
  console.log(`\n  Enter a number (1-${tables.length}) or table name, or 'q' to quit.`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (): Promise<void> =>
    new Promise((resolve) => {
      rl.question("  > ", async (answer) => {
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === "q" || trimmed === "quit") {
          rl.close();
          resolve();
          return;
        }

        const num = parseInt(trimmed, 10);
        let tableName: string | null = null;

        if (num >= 1 && num <= tables.length) {
          tableName = tables[num - 1].name;
        } else {
          const found = tables.find(
            (t) => t.name.toLowerCase().includes(trimmed),
          );
          if (found) tableName = found.name;
        }

        if (tableName) {
          rl.close();
          await browseTable(raw, doc, tableName);
        } else {
          console.log("  Not found. Try a number or table name.");
          resolve(await ask());
        }
        resolve();
      });
    });

  await ask();
}

// ─── Table browser ──────────────────────────────────────────────

async function browseTable(
  raw: DynamoDBClient,
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<void> {
  // Show schema header
  await printTableHeader(raw, tableName);

  // Paginated scan
  let cursor: Record<string, unknown> | undefined;
  let pageNum = 0;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const showPage = async (): Promise<void> => {
    const result = await doc.send(
      new ScanCommand({
        TableName: tableName,
        Limit: PAGE_SIZE,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );

    const items = result.Items ?? [];
    cursor = result.LastEvaluatedKey;
    pageNum++;

    if (items.length === 0 && pageNum === 1) {
      console.log("\n  (empty table)\n");
      rl.close();
      return;
    }

    for (let i = 0; i < items.length; i++) {
      printItem(items[i], (pageNum - 1) * PAGE_SIZE + i + 1);
    }

    const total = result.ScannedCount ?? items.length;
    console.log(
      `\n  Page ${pageNum} — ${(pageNum - 1) * PAGE_SIZE + 1}-${(pageNum - 1) * PAGE_SIZE + items.length} of ${total}+ scanned`,
    );

    if (cursor) {
      console.log("  [Enter] next page  |  [q] quit");
      rl.question("  ", async (answer) => {
        if (answer.trim().toLowerCase() === "q") {
          rl.close();
        } else {
          await showPage();
        }
      });
    } else {
      console.log("  (end of table)\n");
      rl.close();
    }
  };

  await showPage();
}

// ─── Schema header ──────────────────────────────────────────────

async function printTableHeader(
  raw: DynamoDBClient,
  tableName: string,
): Promise<void> {
  try {
    const result = await raw.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    const table = result.Table;
    if (!table) return;

    const keys = (table.KeySchema ?? [])
      .map((k: any) => `${k.AttributeName} (${k.KeyType})`)
      .join(", ");
    const indexes = [
      ...(table.LocalSecondaryIndexes ?? []).map((i: any) => `LSI: ${i.IndexName}`),
      ...(table.GlobalSecondaryIndexes ?? []).map((i: any) => `GSI: ${i.IndexName}`),
    ];
    const stream = table.LatestStreamArn ? "🌊 Stream enabled" : "";

    console.log(`\n${"─".repeat(60)}`);
    console.log(`📋 ${tableName}`);
    console.log(`   Keys: ${keys}`);
    console.log(`   Items: ${table.ItemCount ?? "?"}  |  Size: ${formatBytes(table.TableSizeBytes ?? 0)}`);
    if (indexes.length > 0) console.log(`   Indexes: ${indexes.join(", ")}`);
    if (stream) console.log(`   ${stream}`);
    console.log(`${"─".repeat(60)}\n`);
  } catch {
    console.log(`\n📋 ${tableName}\n${"─".repeat(60)}\n`);
  }
}

// ─── Item formatting ────────────────────────────────────────────

function printItem(item: Record<string, unknown>, idx: number): void {
  const keys = extractKeys(item);
  console.log(`\n  #${idx}  ${keys}`);
  for (const [key, value] of Object.entries(item)) {
    if (isKeyAttribute(key, item)) continue; // already shown in header
    const formatted = formatValue(value);
    console.log(`       ${key}: ${formatted}`);
  }
}

function extractKeys(item: Record<string, unknown>): string {
  const parts: string[] = [];
  // Try common key names
  for (const k of ["pk", "isbn", "customerId", "sessionId", "productId", "userId", "articleId"]) {
    if (item[k] !== undefined) parts.push(`${k}=${formatValue(item[k])}`);
  }
  for (const k of ["sk", "orderDate", "status"]) {
    if (item[k] !== undefined && !parts.some((p) => p.includes(k))) {
      parts.push(`${k}=${formatValue(item[k])}`);
    }
  }
  return parts.join("  ");
}

function isKeyAttribute(key: string, item: Record<string, unknown>): boolean {
  const keyNames = ["pk", "sk", "isbn", "customerId", "orderDate", "sessionId", "productId", "userId", "articleId", "gsi1Pk", "gsi1Sk"];
  return keyNames.includes(key) && Object.keys(item).length > keyNames.filter((k) => item[k] !== undefined).length;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    // Format numbers nicely
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "string") {
    // Truncate long strings
    return value.length > 80 ? value.slice(0, 77) + "..." : value;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v)).join(", ")}]`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ─── Raw JSON scan (original behavior) ──────────────────────────

async function rawScan(
  doc: DynamoDBDocumentClient,
  tableFilter: string[],
): Promise<void> {
  const known = [
    "books", "orders", "ecommerce", "sessions",
    "inventory", "profiles", "stats", "stream_demo",
  ];
  const tables = tableFilter.length > 0 ? tableFilter : known;

  for (const name of tables) {
    const tableName = name.startsWith(PREFIX) ? name : `${PREFIX}${name}`;
    try {
      const result = await doc.send(
        new ScanCommand({ TableName: tableName, Limit: 50 }),
      );
      console.log(`\n── ${tableName} (${result.Count} items) ──`);
      if (!result.Items || result.Items.length === 0) {
        console.log("  (empty)");
      } else {
        for (const item of result.Items) {
          console.log(JSON.stringify(item, null, 2));
          console.log("  ──");
        }
      }
    } catch {
      console.log(`\n── ${tableName} (not found) ──`);
    }
  }
}

function ensurePrefix(name: string): string {
  return name.startsWith(PREFIX) ? name : `${PREFIX}${name}`;
}

main().catch((error) => {
  console.error("Scan failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
