# Module 01: Core CRUD Operations

## What is DynamoDB?

DynamoDB is a **fully managed NoSQL key-value and document database**. Unlike relational databases (PostgreSQL, MySQL) where you define schemas upfront with columns and types, DynamoDB gives you a flexible structure where each item can have different attributes.

## Core Concepts

### 1. Tables, Items, and Attributes

| Relational DB | DynamoDB |
|---|---|
| Table | Table |
| Row | Item |
| Column | Attribute |

A DynamoDB **item** is a collection of attributes (key-value pairs). The only required attributes are the **primary key** components — everything else is optional and can vary per item.

### 2. Primary Keys

Every item in DynamoDB must have a unique primary key. There are two types:

**Simple Primary Key (Partition Key only):**
```
Item: { isbn: "978-0134685991", title: "Effective Java", author: "Joshua Bloch" }
         ^^^^^^^^^^^^^^^^^^^^
         Partition Key — determines which physical partition stores this item
```

**Composite Primary Key (Partition Key + Sort Key):**
```
Item: { customerId: "cust_1", orderDate: "2024-01-15T10:30:00Z", total: 34.98 }
         ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         Partition Key        Sort Key — items with same PK are stored together, ordered by SK
```

### 3. How DynamoDB Reads Differ from SQL

- **GetItem**: Fetch ONE item by its exact primary key. Like `SELECT * WHERE pk = X` but only for the full key. This is the fastest operation.
- **Consistent Read vs Eventually Consistent Read**: By default, reads are *eventually consistent* (may return stale data from a replica, but costs half the RCU). Use `ConsistentRead: true` for strongly consistent reads (always returns the latest write, costs 1 RCU per 4KB).
- **ProjectionExpression**: Request only specific attributes instead of the entire item — saves bandwidth and read capacity.

### 4. How DynamoDB Writes Differ from SQL

- **PutItem**: Create a new item OR fully replace an existing item with the same key. There is no "INSERT vs UPDATE" distinction — PutItem is an upsert.
- **UpdateItem**: Modify specific attributes of an existing item. Uses *update expressions* like `SET`, `REMOVE`, `ADD`, `DELETE`. Can also create a new item if it doesn't exist (with proper configuration).
- **DeleteItem**: Remove an item by its primary key. Can include a `ConditionExpression` to prevent accidental deletion.

### 5. Data Types

DynamoDB has a rich type system:

| Type | Description | Example |
|---|---|---|
| S | String | "Hello" |
| N | Number | 42, 3.14 |
| B | Binary | base64-encoded bytes |
| BOOL | Boolean | true/false |
| NULL | Null | null |
| M | Map (nested object) | { name: "Alice", age: 30 } |
| L | List (array) | ["a", "b", "c"] |
| SS | String Set | ["tag1", "tag2"] |
| NS | Number Set | [1, 2, 3] |

> **Note**: With the DocumentClient (which we use), these types are automatically marshalled/unmarshalled. You work with plain JavaScript objects.

### 6. Condition Expressions

Condition expressions let you make operations conditional:
- `attribute_not_exists(isbn)` — only create if the item doesn't already exist (prevents overwrites)
- `attribute_exists(isbn)` — only update/delete if the item exists
- `#rating > :minRating` — only operate if a condition is met

Condition expressions are evaluated **before** the write. If the condition fails, you get a `ConditionalCheckFailedException`.

### 7. Return Values

The `ReturnValues` parameter controls what DynamoDB returns after a write:

| Value | Behavior |
|---|---|
| NONE (default) | Returns nothing (just HTTP 200) |
| ALL_OLD | Returns the item as it was BEFORE the write |
| UPDATED_OLD | Returns the old values of only the updated attributes |
| ALL_NEW | Returns the item as it is AFTER the write |
| UPDATED_NEW | Returns the new values of only the updated attributes |

### 8. Consumed Capacity

Every operation can return `ConsumedCapacity` — how many read/write capacity units were used. This is essential for understanding DynamoDB's pricing model:
- **1 RCU** = 1 strongly consistent read of up to 4KB, or 2 eventually consistent reads of up to 4KB
- **1 WCU** = 1 write of up to 1KB

## What You'll Practice

In the exercise, you'll:
1. Create a book in the Books table using `PutItem`
2. Read it back with `GetItem` (both consistent and eventual reads)
3. Update specific fields with `UpdateItem` expressions
4. Delete with a condition expression to prevent accidental deletion
5. Observe capacity consumption for each operation

## Key Gotchas

- **PutItem replaces entire items** — if you PutItem with the same key but only some attributes, you'll LOSE the attributes you didn't include
- **Eventually consistent reads may return stale data** — always ask yourself if your use case needs strong consistency
- **ConditionExpression failures throw** — wrap in try/catch and check the error type
- **Empty strings and empty sets** — DynamoDB does NOT allow empty strings ("") or empty sets; the DocumentClient may strip them
