# Module 04: Single-Table Design

## The Paradigm Shift

In a relational database, you create a separate table for each entity:

```
Users table    →  id, name, email
Orders table   →  id, user_id, total, status
Products table →  id, name, price, stock
```

In DynamoDB single-table design, **all entities share ONE table**:

```
Ecommerce table:
  PK              SK                  type      name     email           total   status
  USER#alice      PROFILE             USER      Alice    alice@ex.com    —       —
  USER#alice      ORDER#ord1          ORDER     —        —               34.98   DELIVERED
  USER#bob        PROFILE             USER      Bob      bob@ex.com      —       —
  USER#bob        ORDER#ord3          ORDER     —        —               9.99    SHIPPED
  PRODUCT#p1      DETAILS             PRODUCT   Widget   —               9.99    —
  PRODUCT#p2      DETAILS             PRODUCT   Gadget   —               24.99   —
```

Notice: attributes vary by entity type. User items have `email`. Order items have `total` and `status`. Product items have `price` and `stock`. This is completely normal in DynamoDB — items in the same table can have different attributes.

## Why Single-Table Design?

### 1. Fewer Requests
In a multi-table design, fetching a user AND their orders requires TWO queries:
```sql
SELECT * FROM users WHERE id = 'alice';
SELECT * FROM orders WHERE user_id = 'alice';
```

In single-table, one Query gets both:
```
Query: PK = "USER#alice"
Returns: [PROFILE item, ORDER#ord1 item, ORDER#ord2 item]
```

### 2. Better Performance at Scale
DynamoDB partitions scale independently. With single-table, related data lives in the same partition — queries are fast and consistent.

### 3. Schema Flexibility
Adding a new entity type (e.g., "Reviews") just means writing new items with new attribute shapes. No ALTER TABLE needed.

## Core Patterns

### Key Overloading
The same PK/SK structure serves multiple entity types through naming conventions:
- PK: `USER#<id>` / `PRODUCT#<id>` / `ORDER#<id>`
- SK: `PROFILE` / `ORDER#<id>` / `DETAILS`

The prefix tells you the entity type. The suffix identifies the specific entity.

### Entity Discrimination
Use a `type` or `entityType` attribute (or infer from PK prefix) to know what kind of item you're looking at:

```typescript
if (item.entityType === "USER") { /* handle user */ }
else if (item.entityType === "ORDER") { /* handle order */ }
```

### GSI Overloading
One GSI can serve multiple access patterns. By overloading the GSI keys:

```
GSI1: gsi1Pk (partition), gsi1Sk (sort)

Access Pattern 1: "Get all users"        → Query GSI1 where gsi1Pk = "PROFILE"
Access Pattern 2: "Get all orders by date" → Query GSI1 where gsi1Pk = "ORDER"
Access Pattern 3: "Get all products"      → Query GSI1 where gsi1Pk = "PRODUCT"
```

Three different queries, ONE index.

### Adjacency List Pattern
Related entities are stored adjacent in the same partition:

```
PK=USER#alice
  ├── SK=PROFILE           (the user)
  ├── SK=ORDER#ord1        (their first order)
  ├── SK=ORDER#ord2        (their second order)
  └── SK=REVIEW#rev1       (their product review)
```

Querying `PK=USER#alice` returns the user and ALL their related data in one shot.

## Access-Pattern-First Design

This is THE most important shift in thinking:

| Relational mindset | DynamoDB mindset |
|---|---|
| "What entities do I have?" | "What queries do I need?" |
| Normalize, then denormalize for perf | Denormalize from the start |
| Schema-first | Access-pattern-first |

**The process:**
1. List ALL your application's access patterns (screens, API endpoints)
2. Group them by the entity they query
3. Design your PK/SK to satisfy as many patterns as possible with single queries
4. Use GSIs for the remaining patterns
5. Accept that some patterns may need multiple queries (that's okay)

## What You'll Practice

1. Model an e-commerce domain in a single table
2. Use key overloading to store Users, Orders, Products together
3. Query multiple entity types from one partition
4. Use a GSI for cross-entity queries ("all users", "all orders by date")
5. Add a new access pattern without schema changes

## Key Gotchas

- **Don't overdo it** — if two entities have zero shared access patterns, separate tables are fine
- **Attribute naming matters** — use generic names (pk, sk, gsi1Pk) not entity-specific names
- **Partition hot keys** — if one user has millions of orders, that partition gets HOT
- **Item size limit** — each item is max 400KB; large collections need to be split across items
- **Don't prematurely optimize** — start with separate tables, refactor to single-table when you hit scale
- **GSI overloading requires discipline** — naming conventions must be consistent across your codebase
