import { Pool, type PoolConfig } from "pg";
import { AppError } from "./errors.js";

// Small interface also used by offline tests. Transactions always use one client.
export interface PgClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface PgPool {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}
export function postgresOptions(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  // pg connection-string SSL parameters otherwise override the explicit TLS options.
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("ssl") || key === "uselibpqcompat") url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(), ssl: { rejectUnauthorized: true },
    max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    query_timeout: 6000,
    application_name: "aclaradoc-quota",
  };
}
export function createPostgresPool(databaseUrl: string): PgPool {
  const pool = new Pool(postgresOptions(databaseUrl));
  pool.on("error", () => { /* Idle connection failures are not logged with secrets. Admissions fail closed. */ });
  return pool;
}
export async function transaction<T>(pool: PgPool, operation: (client: PgClient) => Promise<T>): Promise<T> {
  let client: PgClient | undefined;
  let destroy = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // Transaction-local settings survive pooled routing without session startup GUCs.
    await client.query("SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '3s'");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // Do not reuse a connection after a driver/network error or uncertain COMMIT.
    destroy = !(error instanceof AppError);
    if (client) {
      try { await client.query("ROLLBACK"); } catch { destroy = true; }
    }
    if (error instanceof AppError) throw error;
    throw new AppError("UNAVAILABLE", 503);
  } finally { client?.release(destroy); }
}
