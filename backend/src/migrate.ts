import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { backendRoot } from "./paths.js";
import { readConfig } from "./config.js";
import { createPostgresPool } from "./postgres-client.js";
import { migrate } from "./migrations.js";

dotenv({ path: resolve(backendRoot, ".env"), quiet: true });
async function main() {
  // Migration needs only the database credential, never a Gemini key.
  const config = readConfig({ QUOTA_STORE: "postgres", DATABASE_URL: process.env.DATABASE_URL });
  const pool = createPostgresPool(config.DATABASE_URL);
  try { await migrate(pool, resolve(backendRoot, "migrations")); }
  finally { await pool.end(); }
  console.info("Migraciones de cuotas aplicadas correctamente.");
}
void main().catch(() => {
  console.error("No se pudieron aplicar las migraciones. Revisa la conexión privada y el esquema de cuotas.");
  process.exitCode = 1;
});
