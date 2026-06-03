import {
  type DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  type KeySchemaElement,
  type AttributeDefinition,
  type GlobalSecondaryIndex,
  type LocalSecondaryIndex,
  type BillingMode,
} from "@aws-sdk/client-dynamodb";

/**
 * Fluent API for creating and tearing down DynamoDB tables in tests.
 *
 * Usage:
 *   await tableBuilder(client, "my_table")
 *     .withPK("pk", "S")
 *     .withSK("sk", "S")
 *     .withGSI("gsi1", "gsiPk", "S", "gsiSk", "S")
 *     .create();
 */
export function tableBuilder(client: DynamoDBClient, tableName: string) {
  let pk: KeySchemaElement | null = null;
  let sk: KeySchemaElement | null = null;
  const attributes: AttributeDefinition[] = [];
  const gsis: GlobalSecondaryIndex[] = [];
  const lsis: LocalSecondaryIndex[] = [];
  let billingMode: BillingMode = "PAY_PER_REQUEST";

  function addAttribute(name: string, type: "S" | "N" | "B"): void {
    if (!attributes.find((a) => a.AttributeName === name)) {
      attributes.push({ AttributeName: name, AttributeType: type });
    }
  }

  return {
    withPK(name: string, type: "S" | "N" | "B") {
      pk = { AttributeName: name, KeyType: "HASH" };
      addAttribute(name, type);
      return this;
    },

    withSK(name: string, type: "S" | "N" | "B") {
      sk = { AttributeName: name, KeyType: "RANGE" };
      addAttribute(name, type);
      return this;
    },

    withGSI(
      indexName: string,
      gsiPk: string,
      gsiPkType: "S" | "N" | "B",
      gsiSk?: string,
      gsiSkType?: "S" | "N" | "B",
    ) {
      addAttribute(gsiPk, gsiPkType);

      const keySchema: KeySchemaElement[] = [
        { AttributeName: gsiPk, KeyType: "HASH" },
      ];

      if (gsiSk && gsiSkType) {
        addAttribute(gsiSk, gsiSkType);
        keySchema.push({ AttributeName: gsiSk, KeyType: "RANGE" });
      }

      gsis.push({
        IndexName: indexName,
        KeySchema: keySchema,
        Projection: { ProjectionType: "ALL" },
      });

      return this;
    },

    withLSI(
      indexName: string,
      lsiSk: string,
      lsiSkType: "S" | "N" | "B",
    ) {
      addAttribute(lsiSk, lsiSkType);

      lsis.push({
        IndexName: indexName,
        KeySchema: [
          { AttributeName: pk!.AttributeName, KeyType: "HASH" },
          { AttributeName: lsiSk, KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      });

      return this;
    },

    withBillingMode(mode: BillingMode) {
      billingMode = mode;
      return this;
    },

    async create(): Promise<void> {
      if (!pk) {
        throw new Error("Partition key (PK) is required. Call withPK() before create().");
      }

      const keySchema: KeySchemaElement[] = [pk];
      if (sk) {
        keySchema.push(sk);
      }

      await client.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: keySchema,
          AttributeDefinitions: attributes,
          BillingMode: billingMode,
          ...(gsis.length > 0 ? { GlobalSecondaryIndexes: gsis } : {}),
          ...(lsis.length > 0 ? { LocalSecondaryIndexes: lsis } : {}),
        }),
      );

      // DDB Local creates tables near-instantly — brief wait suffices
      await new Promise((resolve) => setTimeout(resolve, 500));
    },

    async delete(): Promise<void> {
      try {
        await client.send(
          new DeleteTableCommand({ TableName: tableName }),
        );
      } catch {
        // Table may already not exist — that's fine for cleanup
      }
    },
  };
}
