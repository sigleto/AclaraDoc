import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Config } from "./config.js";
import { backendRoot } from "./paths.js";
import { MemoryQuotaStore, type QuotaStore } from "./quota-store.js";
import { PostgresQuotaStore } from "./postgres-quota-store.js";
import { createPostgresPool, type PgPool } from "./postgres-client.js";

export async function createQuotaStore(config: Config, options: { pool?: PgPool; sqlitePath?: string } = {}): Promise<QuotaStore> {
  if (config.QUOTA_STORE === "memory") return new MemoryQuotaStore();
  if (config.QUOTA_STORE === "postgres") return new PostgresQuotaStore(options.pool ?? createPostgresPool(config.DATABASE_URL));
  // SQLite is never loaded and its directory is never created in PostgreSQL mode.
  const { SQLiteQuotaStore } = await import("./sqlite-quota-store.js");
  const directory = resolve(backendRoot, ".data");
  if (!options.sqlitePath) await mkdir(directory, { recursive: true, mode: 0o700 });
  return new SQLiteQuotaStore(options.sqlitePath ?? resolve(directory, "quotas.sqlite"), config.quotas.SQLITE_BUSY_TIMEOUT_MS);
}
