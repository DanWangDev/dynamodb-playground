/**
 * Starts a local DynamoDB-compatible server using dynalite.
 *
 * dynalite is a pure-Node.js DynamoDB emulator that avoids the
 * SigV4/JVM issues that Docker-based DynamoDB Local has on some Windows setups.
 *
 * Limitations vs Java DDB Local:
 *   - No Transactions (Module 05 transactions will fail gracefully)
 *   - No Streams (Module 05 streams exercise will show no stream)
 *   - No TTL auto-expiry (items with TTL won't be deleted automatically)
 *
 * GSIs and LSIs are supported — Modules 03 and 04 work fully.
 * These features work against real AWS DynamoDB (free tier eligible).
 */

import dynalite from "dynalite";

const PORT = parseInt(process.env["DDB_PORT"] ?? "8000", 10);
const DATA_DIR = process.env["DDB_DATA_DIR"] ?? "./.dynalite-data";

const server = dynalite({
  path: DATA_DIR,
  createTableMs: 0,
  deleteTableMs: 0,
  updateTableMs: 0,
});

server.listen(PORT, () => {
  console.log(`DynamoDB emulator (dynalite) running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log("");
  console.log("Limitations: no Transactions, no Streams, no TTL auto-expiry");
  console.log("GSIs and LSIs work. Modules 01-04 run fully, 05 partially.");
  console.log("For everything: use real AWS DynamoDB (free tier eligible).");
  console.log("");
  console.log("Press Ctrl+C to stop.");
});
