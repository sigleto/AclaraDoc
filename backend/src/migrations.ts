import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { transaction, type PgPool } from "./postgres-client.js";
import { AppError } from "./errors.js";

export async function migrate(pool: PgPool, directory: string) {
  const names = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(names.map(async name => {
    const sql = await readFile(join(directory, name), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex") };
  }));
  await transaction(pool, async client => {
    // Transaction-scoped lock also works with Neon's pooled endpoint.
    await client.query("SELECT pg_advisory_xact_lock(724619305)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    for (const migration of migrations) {
      const applied = await client.query("SELECT checksum FROM schema_migrations WHERE name = $1", [migration.name]);
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== migration.checksum) throw new AppError("UNAVAILABLE", 503);
        continue;
      }
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [migration.name, migration.checksum]);
    }
  });
}
