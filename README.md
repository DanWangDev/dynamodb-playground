# DynamoDB Playground

> 📖 [中文版 (Chinese Version)](README.zh-CN.md)

A hands-on, exercise-driven DynamoDB learning project. Each module explains a concept, then lets you practice it with runnable TypeScript exercises.

## Quick Start

**Option A — Real AWS DynamoDB (recommended for full features):**

```bash
# 1. Install dependencies
npm install

# 2. Configure your .env (no DDB_ENDPOINT = cloud)
#    Credentials are picked up from ~/.aws/credentials or env vars
cp .env.example .env
#    Edit .env: comment out DDB_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

# 3. Create tables and seed data (goes to your AWS account)
npm run setup
npm run seed

# 4. Run your first exercise!
npm run exercise:crud
```

**Option B — Local emulator (no AWS account needed):**

```bash
# 1. Install dependencies
npm install

# 2. Start the local DynamoDB emulator in a separate terminal
npm run db:start

# 3. Create tables and seed data
npm run setup
npm run seed

# 4. Run your first exercise!
npm run exercise:crud
```

## Learning Path

Each module follows a **concept → practice** pattern:
1. Read the `concept.md` file for the module
2. Run the `exercise.ts` script to practice
3. Read the source code to see how each operation is implemented
4. Modify the exercise files to experiment

| Module | Command | What You'll Learn |
|--------|---------|-------------------|
| **01 CRUD** | `npm run exercise:crud` | PutItem, GetItem, UpdateItem, DeleteItem, data types, condition expressions, return values, consumed capacity |
| **02 Queries** | `npm run exercise:queries` | Query vs Scan, KeyConditionExpression, FilterExpression, pagination, composite keys |
| **03 Indexes** | `npm run exercise:indexes` | LSI, GSI, sparse indexes, projection types, index design decisions, GSI vs Scan cost comparison |
| **04 Single-Table** | `npm run exercise:single-table` | Key overloading, entity discrimination, adjacency lists, GSI overloading, access-pattern-first design |
| **05 Advanced** | `npm run exercise:advanced` | Transactions, batch operations, TTL, optimistic locking, conditional writes, atomic counters |
| **06 Streams** | `npm run exercise:streams` | Stream enablement, shard iteration, INSERT/MODIFY/REMOVE events, Lambda triggers, event source mapping |
| **07 Capacity** | `npm run exercise:capacity` | RCU/WCU, provisioned vs on-demand, cost estimation, break-even analysis, monitoring |
| **08 Production** | `npm run exercise:production` | Global Tables, PITR, on-demand backups, DAX, cost comparison |

## Project Structure

```
src/
├── config/          # Zod-validated env, DynamoDB client factory
├── shared/          # Types, errors, logger, validators
├── 01-crud/         # Basic CRUD on Books table
├── 02-queries/      # Queries & Scans on Orders table
├── 03-indexes/      # LSI/GSI on Orders table
├── 04-single-table/ # E-commerce in one table
├── 05-advanced/     # Transactions, TTL, streams, counters
├── 06-streams/      # Streams & Lambda triggers
├── 07-capacity/     # RCU/WCU, provisioned vs on-demand, cost estimation
└── 08-production/   # Global Tables, PITR, backups, DAX

test/                # Vitest tests (mirrors src/ structure)
scripts/             # Table setup, teardown, seed data, DB launcher
```

## Prerequisites

- **Node.js 18+** — runtime
- **Option A (cloud):** An AWS account with DynamoDB access (free tier covers 25 GB storage + 25 RCU/WCU)
- **Option B (local):** No Docker or AWS account required — just Node.js

## Data Management

```bash
npm run reset       # Purge all data, recreate tables, re-seed (teardown + setup + seed)
npm run db:scan     # Interactive table browser (pick table, paginate, formatted output)
npm run db:describe # Show table schemas, keys, indexes, item counts, sizes
npm run teardown    # Delete all playground tables
npm run setup       # Create tables (safe to re-run — skips existing)
npm run seed        # Populate with fresh sample data
```

**Step-by-step mode:** Add `--step` to any exercise to pause between operations:
```bash
npx tsx src/01-crud/exercise.ts --step
```
In another terminal, run `npm run db:scan` to inspect the database between steps.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run db:start` | Start local DynamoDB emulator (dynalite) |
| `npm run db:docker` | Alternative: start DDB Local via Docker |
| `npm run reset` | Purge all data, recreate tables, re-seed |
| `npm run setup` | Create all playground tables |
| `npm run seed` | Populate tables with sample data |
| `npm run teardown` | Delete all playground tables |
| `npm run db:scan` | Interactive table browser (pick table, paginate, formatted) |
| `npm run db:describe` | Show table schemas, keys, indexes, item counts, sizes |
| `npm run exercise:crud` | Run Module 01 exercise |
| `npm run exercise:queries` | Run Module 02 exercise |
| `npm run exercise:indexes` | Run Module 03 exercise |
| `npm run exercise:single-table` | Run Module 04 exercise |
| `npm run exercise:advanced` | Run Module 05 exercise |
| `npm run exercise:streams` | Run Module 06 exercise (requires real AWS) |
| `npm run exercise:capacity` | Run Module 07 exercise |
| `npm run exercise:production` | Run Module 08 exercise |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck` | TypeScript type checking |

## Configuration

### AWS Cloud (default)

When `DDB_ENDPOINT` is **not set** in `.env`, the SDK connects to real AWS DynamoDB. Credentials are resolved via the standard AWS chain:

1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` environment variables
2. `~/.aws/credentials` profile (`aws configure`)
3. IAM role (EC2, ECS, Lambda)

```bash
# .env — cloud mode (no endpoint = real AWS)
AWS_REGION=eu-west-2
DDB_TABLE_PREFIX=playground_
```

### Local Emulator

The default emulator is **dynalite**, a pure-Node.js DynamoDB-compatible server that starts instantly and avoids JVM/Docker issues on Windows.

```bash
# .env — local mode
DDB_ENDPOINT=http://127.0.0.1:8000
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
DDB_TABLE_PREFIX=playground_
```

**Fully supported locally:** CRUD, Query, Scan, GSIs, LSIs, Batch ops, Conditional writes, Atomic counters
**Requires real AWS:** Transactions, Streams, TTL auto-expiry

To use the full-featured Java-based DynamoDB Local instead:
```bash
npm run db:docker    # Requires Docker
```

## Design Decisions

- **Client factory, not singleton** — every module creates its own DynamoDB client, making tests isolatable
- **Zod validation** — all user inputs validated at module boundaries
- **Immutability** — functions return new objects, never mutate
- **Zero frameworks** — only the AWS SDK v3, Zod, and dotenv. No Express, no ORM, no CLI framework
- **Code IS documentation** — exercise scripts walk through each concept step-by-step

## Testing

Tests use Vitest with the local emulator. Each test file creates its own uniquely-named tables for isolation.

```bash
# Run all tests
npm test

# Run a specific module's tests
npx vitest run test/01-crud/

# Run with coverage (target: 80%+)
npm run test:coverage
```
