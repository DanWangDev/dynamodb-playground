/**
 * Module 06 Exercise: DynamoDB Streams & Lambda
 *
 * Run: npm run exercise:streams  (or: npx tsx src/06-streams/exercise.ts)
 *
 * Prerequisites:
 *   1. Real AWS DynamoDB (dynalite does not support streams)
 *      → Comment out DDB_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in .env
 *   2. npm run setup (creates playground_stream_demo table with streams enabled)
 */

import { createClientFromEnv } from "../config/dynamodb";
import { env } from "../config/env";
import { createLogger } from "../shared/logger";
import { enableStepMode, stepPause } from "../shared/prompt";
import {
  createStreamDemoItem,
  updateStreamDemoItem,
  deleteStreamDemoItem,
  readAndSummarizeStream,
} from "./operations";
import { explainLambdaPattern, explainDeployment } from "./lambda-handler";

const log = createLogger("06-streams");
const TABLE = `${env.DDB_TABLE_PREFIX}stream_demo`;

async function run(): Promise<void> {
  // Streams require real AWS DynamoDB
  if (env.DDB_ENDPOINT) {
    console.error(
      "✗ This exercise requires real AWS DynamoDB (dynalite does not support streams).\n" +
        "  Comment out DDB_ENDPOINT, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY in your .env file\n" +
        "  to use the AWS cloud endpoint.",
    );
    process.exit(1);
  }

  const { doc } = createClientFromEnv(env);

  log.section("Module 06: DynamoDB Streams & Lambda");
  console.log(
    "Streams capture every item change. Lambda processes them in real-time.\n",
  );

  // ─── Step 1: Streams Concept & Setup ──────────────────────────
  log.section("Step 1: Enable Streams — The Table's Change Log");

  log.concept(
    "DynamoDB Streams capture a time-ordered sequence of every item change.\n" +
      "  • INSERT → new item created (PutItem)\n" +
      "  • MODIFY → item updated (UpdateItem)\n" +
      "  • REMOVE → item deleted (DeleteItem)\n\n" +
      "Records are retained for 24 hours. You choose how much data to capture:\n" +
      "  • KEYS_ONLY — just the primary key\n" +
      "  • NEW_IMAGE — the item after the change\n" +
      "  • OLD_IMAGE — the item before the change\n" +
      "  • NEW_AND_OLD_IMAGES — both before and after (best for detecting what changed)",
  );

  log.step(`Checking stream status on ${TABLE}...`);
  const { streamArn: initialArn } = await readAndSummarizeStream(TABLE);

  if (initialArn) {
    log.success(`Stream is active!`, { streamArn: initialArn });
  } else {
    log.warn(
      "No stream found. Make sure the table was created with streams enabled.\n" +
        "  Run: npm run setup  (the playground_stream_demo table includes streams)",
    );
  }

  await stepPause();

  // ─── Step 2: Create Items → INSERT Events ─────────────────────
  log.section("Step 2: Create Items — Generating INSERT Events");

  log.concept(
    "Every PutItem call generates an INSERT event in the stream.\n" +
      "The stream record includes the NEW_IMAGE (the full item that was written)\n" +
      "and the OLD_IMAGE is empty (the item didn't exist before).",
  );

  log.step("Creating 3 items across 2 different partition keys...");
  const item1 = await createStreamDemoItem(doc, TABLE, {
    pk: "category_A",
    sk: "item_1",
    data: "First item in category A",
    counter: 0,
  });
  log.success("Created", { pk: item1.pk, sk: item1.sk });

  const item2 = await createStreamDemoItem(doc, TABLE, {
    pk: "category_A",
    sk: "item_2",
    data: "Second item in category A",
    counter: 0,
  });
  log.success("Created", { pk: item2.pk, sk: item2.sk });

  const item3 = await createStreamDemoItem(doc, TABLE, {
    pk: "category_B",
    sk: "item_3",
    data: "An item in category B",
    counter: 0,
  });
  log.success("Created", { pk: item3.pk, sk: item3.sk });

  log.info(
    "These 3 PutItem calls generated 3 INSERT stream records across 2 shards.",
  );

  await stepPause();

  // ─── Step 3: Update Items → MODIFY Events ─────────────────────
  log.section("Step 3: Update Items — Generating MODIFY Events");

  log.concept(
    "UpdateItem calls generate MODIFY events. The stream record shows:\n" +
      "  • NEW_IMAGE: the item after the update\n" +
      "  • OLD_IMAGE: the item before the update\n\n" +
      "With NEW_AND_OLD_IMAGES view type, you can compare before/after\n" +
      "to detect specific changes (e.g., 'did status change?' or 'how much did counter increase?').",
  );

  log.step("Updating item_1 (changing data AND incrementing counter)...");
  const updated = await updateStreamDemoItem(doc, TABLE, {
    pk: "category_A",
    sk: "item_1",
    data: "Updated data — now with more information!",
    incrementBy: 5,
  });
  log.success("Updated!", {
    data: updated?.data,
    counter: updated?.counter,
  });

  log.step("Updating item_2 (incrementing counter only, no data change)...");
  await updateStreamDemoItem(doc, TABLE, {
    pk: "category_A",
    sk: "item_2",
    incrementBy: 3,
  });
  log.success("Counter incremented");

  log.info("These updates generated MODIFY records. Each shows old AND new values.");

  await stepPause();

  // ─── Step 4: Delete Item → REMOVE Event ───────────────────────
  log.section("Step 4: Delete an Item — Generating a REMOVE Event");

  log.concept(
    "DeleteItem calls generate REMOVE events. The stream record shows:\n" +
      "  • OLD_IMAGE: the item as it was before deletion\n" +
      "  • NEW_IMAGE: empty (the item no longer exists)\n\n" +
      "REMOVE events are useful for: cleanup of related data, archival,\n" +
      "deletion confirmations, and maintaining secondary indexes.",
  );

  log.step("Deleting item_3...");
  await deleteStreamDemoItem(doc, TABLE, "category_B", "item_3");
  log.success("Deleted category_B/item_3");

  log.info(
    "This generated a REMOVE record. Note: TTL expirations also generate REMOVE events!",
  );

  await stepPause();

  // ─── Step 5: Read Stream Records ─────────────────────────────
  log.section("Step 5: Read Stream Records — See What Was Captured");

  log.concept(
    "Now we read the stream using shard iteration:\n" +
      "  1. Get the stream ARN from the table\n" +
      "  2. Describe the stream to get shards\n" +
      "  3. For each shard, get a TRIM_HORIZON iterator\n" +
      "  4. Read records → get next iterator → repeat until no more records\n\n" +
      "Note: Records may take a few seconds to appear after writes.\n" +
      "We wait 3 seconds to ensure they're visible.",
  );

  log.step("Waiting 3 seconds for stream records to become available...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  log.step("Reading stream records...");
  const { streamArn, recordCount, summaries } = await readAndSummarizeStream(TABLE);

  if (!streamArn) {
    log.error("No stream ARN found — is the table configured with streams?");
    doc.destroy();
    return;
  }

  log.success(`Stream ARN: ${streamArn}`);
  log.success(`Found ${recordCount} stream records (${summaries.length} summarised)`);

  if (summaries.length === 0) {
    log.warn(
      "No records found. This can happen if:\n" +
        "  • The records haven't appeared yet (try again in a few seconds)\n" +
        "  • The table was recently created and the stream just activated",
    );
  } else {
    console.log("");
    for (const s of summaries) {
      const icon = s.eventName === "INSERT" ? "+" : s.eventName === "MODIFY" ? "~" : "-";
      console.log(
        `  ${icon} ${s.eventName.padEnd(7)} | ${JSON.stringify(s.keys).padEnd(35)} | seq: ${s.sequenceNumber.slice(0, 20)}...`,
      );
    }
    console.log("");

    // Count event types for insight
    const inserts = summaries.filter((s) => s.eventName === "INSERT").length;
    const modifies = summaries.filter((s) => s.eventName === "MODIFY").length;
    const removes = summaries.filter((s) => s.eventName === "REMOVE").length;
    log.info(`Event breakdown: ${inserts} INSERTs, ${modifies} MODIFYs, ${removes} REMOVEs`);
  }

  await stepPause();

  // ─── Step 6: Lambda Handler Pattern ───────────────────────────
  log.section("Step 6: Lambda Handler — The Production Pattern");

  log.concept(
    "Production systems don't read streams manually. Instead, AWS Lambda\n" +
      "automatically polls the stream and invokes a handler function.\n\n" +
      "The handler receives a batch of stream records and processes each one.\n" +
      "If any records fail, Lambda retries only those specific records\n" +
      "(partial batch failure reporting).",
  );

  console.log(explainLambdaPattern());

  log.step("Here's a production-ready Lambda handler (from lambda-handler.ts):");
  log.info(
    "The handler:\n" +
      "  1. Receives a batch of records (DynamoDBStreamEvent)\n" +
      "  2. Iterates each record, checking eventName (INSERT/MODIFY/REMOVE)\n" +
      "  3. Extracts Keys, NewImage, OldImage\n" +
      "  4. Processes each record in a try/catch to isolate failures\n" +
      "  5. Returns batchItemFailures for records that couldn't be processed",
  );

  log.step("Deployment instructions:");
  console.log(explainDeployment());

  // ─── Summary ──────────────────────────────────────────────────
  log.section("Summary: What You Learned");
  console.log("  1. DynamoDB Streams capture every INSERT, MODIFY, and REMOVE as a record");
  console.log("  2. Stream View Types control how much data each record contains");
  console.log("  3. Shards partition the change log — records are ordered within a shard");
  console.log("  4. Shard iterators (TRIM_HORIZON, LATEST) control where reading starts");
  console.log("  5. Reading a stream is: describe → get shards → get iterator → read → repeat");
  console.log("  6. Lambda + Event Source Mapping = production pattern (no polling code)");
  console.log("  7. Lambda handlers use partial batch failure reporting for reliability");
  console.log("  8. Stream records expire after 24 hours — not for long-term storage");
  console.log("  9. Handlers MUST be idempotent — records can be delivered more than once");

  console.log("\n── Exercise complete! ──");
  console.log(
    "To deploy the Lambda handler to your AWS account, follow the instructions\n" +
      "in Step 6 above and in src/06-streams/concept.md.\n",
  );

  doc.destroy();
}

// ─── Step mode support ────────────────────────────────────────
if (process.argv.includes("--step")) {
  enableStepMode();
}

run().catch((error) => {
  console.error("Exercise failed:", error);
  process.exit(1);
});
