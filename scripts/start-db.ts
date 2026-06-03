/**
 * Starts a local DynamoDB-compatible server using dynalite.
 *
 * dynalite is a pure-Node.js DynamoDB emulator that avoids the
 * SigV4/JVM issues that Docker-based DynamoDB Local has on some Windows setups.
 *
 * Limitations vs Java DDB Local:
 *   - No GSI/LSI support (Modules 03-04 won't work locally)
 *   - No Streams (Module 05 streams exercise won't work)
 *   - No TTL (items won't auto-expire)
 *
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
  console.log("Limitations: no GSI/LSI, no Streams, no TTL");
  console.log("For full features, use real AWS DynamoDB or Docker-based DDB Local.");
  console.log("");
  console.log("Press Ctrl+C to stop.");
});
