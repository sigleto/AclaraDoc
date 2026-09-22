import type { PgClient, PgPool } from "../../src/postgres-client.js";

// Transactional adapter, NOT a PostgreSQL engine. SQL/locking semantics still need
// a real Neon integration check. All connections share this simulated database.
export class FakeDatabase {
  state = { devices: {} as Record<string, number>, globals: {} as Record<string, number>, cooldown: 0, migrations: {} as Record<string, string> };
  queries: { sql: string; values: unknown[] }[] = [];
  fail = false;
  failSql = "";
  tail = Promise.resolve();
  pool(): PgPool & { ended: boolean } {
    const database = this;
    return {
      ended: false,
      async end() { this.ended = true; },
      async connect(): Promise<PgClient> {
        if (database.fail) throw new Error("synthetic-private-database-credential");
        let unlock: (() => void) | undefined;
        let backup: typeof database.state | undefined;
        return {
          async query(sql, values = []) {
            database.queries.push({ sql, values });
            if (database.fail || (database.failSql && sql.includes(database.failSql))) throw new Error("synthetic-private-database-credential");
            if (sql === "BEGIN") {
              const previous = database.tail;
              database.tail = new Promise<void>(resolve => { unlock = resolve; });
              await previous;
              backup = structuredClone(database.state);
            } else if (sql === "ROLLBACK") {
              if (backup) database.state = backup;
              unlock?.(); unlock = undefined;
            } else if (sql === "COMMIT") {
              unlock?.(); unlock = undefined;
            } else if (sql.startsWith("SELECT id FROM quota_control")) {
              return { rows: [{ id: 1 }] };
            } else if (sql.includes("AS device")) {
              return { rows: [{ device: database.state.devices[`${values[0]}:${values[1]}`] ?? 0, global: database.state.globals[String(values[1])] ?? 0, cooldown: String(database.state.cooldown) }] };
            } else if (sql.startsWith("INSERT INTO device_quota")) {
              const key = `${values[0]}:${values[1]}`;
              database.state.devices[key] = (database.state.devices[key] ?? 0) + 1;
            } else if (sql.startsWith("INSERT INTO global_quota")) {
              const key = String(values[0]);
              database.state.globals[key] = (database.state.globals[key] ?? 0) + 1;
            } else if (sql.includes("SET until_ms = GREATEST")) {
              database.state.cooldown = Math.max(database.state.cooldown, Number(values[0]));
            } else if (sql.includes("SET until_ms = 0")) {
              if (database.state.cooldown < Number(values[0])) database.state.cooldown = 0;
            } else if (sql.startsWith("DELETE FROM device_quota")) {
              for (const key of Object.keys(database.state.devices)) if (Number(key.split(":")[1]) < Number(values[0])) delete database.state.devices[key];
            } else if (sql.startsWith("DELETE FROM global_quota")) {
              for (const key of Object.keys(database.state.globals)) if (Number(key) < Number(values[0])) delete database.state.globals[key];
            } else if (sql.startsWith("SELECT checksum")) {
              const checksum = database.state.migrations[String(values[0])];
              return { rows: checksum ? [{ checksum }] : [] };
            } else if (sql.startsWith("INSERT INTO schema_migrations")) {
              database.state.migrations[String(values[0])] = String(values[1]);
            } else if (!sql.startsWith("SELECT pg_advisory_xact_lock") && !sql.startsWith("CREATE TABLE") && !sql.startsWith("SET LOCAL")) {
              throw new Error("Unexpected SQL in test adapter");
            }
            return { rows: [] };
          },
          release() { unlock?.(); },
        };
      },
    };
  }
}
