import { AppError } from "./errors.js";
import { DAY_MS } from "./quota-config.js";
import type { DailyCounts, QuotaStore } from "./quota-store.js";
import { transaction, type PgClient, type PgPool } from "./postgres-client.js";

async function counts(client: PgClient, hash: string, day: number): Promise<DailyCounts> {
  const result = await client.query(`SELECT
    COALESCE((SELECT count FROM device_quota WHERE hash = $1 AND day = $2), 0) AS device,
    COALESCE((SELECT count FROM global_quota WHERE day = $2), 0) AS global,
    until_ms AS cooldown FROM quota_control WHERE id = 1`, [hash, day]);
  const row = result.rows[0];
  if (!row) throw new AppError("UNAVAILABLE", 503);
  const values = { device: Number(row.device), global: Number(row.global), cooldown: Number(row.cooldown) };
  if (Object.values(values).some(value => !Number.isSafeInteger(value) || value < 0)) throw new AppError("UNAVAILABLE", 503);
  return values;
}
export class PostgresQuotaStore implements QuotaStore {
  private pendingPause = 0;
  constructor(private readonly pool: PgPool) {}
  private async lock(client: PgClient) {
    // This existing singleton serializes reservations AND cooldown changes across instances.
    const result = await client.query("SELECT id FROM quota_control WHERE id = 1 FOR UPDATE");
    if (result.rows.length !== 1) throw new AppError("UNAVAILABLE", 503);
  }
  async read(hash: string, day: number) {
    if (this.pendingPause) await this.pause(this.pendingPause);
    return transaction(this.pool, client => counts(client, hash, day));
  }
  async consume(hash: string, day: number, deviceLimit: number, globalLimit: number, now: number, signal?: AbortSignal) {
    if (this.pendingPause) await this.pause(this.pendingPause);
    return transaction(this.pool, async client => {
      await this.lock(client);
      const current = await counts(client, hash, day);
      if (signal?.aborted) throw new AppError("CANCELLED", 499);
      if (now < current.cooldown || current.device >= deviceLimit || current.global >= Math.min(globalLimit, 20)) return false;
      await client.query(`INSERT INTO device_quota (hash, day, count) VALUES ($1, $2, 1)
        ON CONFLICT (hash, day) DO UPDATE SET count = device_quota.count + 1`, [hash, day]);
      await client.query(`INSERT INTO global_quota (day, count) VALUES ($1, 1)
        ON CONFLICT (day) DO UPDATE SET count = global_quota.count + 1`, [day]);
      if (signal?.aborted) throw new AppError("CANCELLED", 499);
      return true;
    });
  }
  async pause(until: number) {
    this.pendingPause = Math.max(this.pendingPause, until);
    const pending = this.pendingPause;
    await transaction(this.pool, async client => {
      await this.lock(client);
      await client.query("UPDATE quota_control SET until_ms = GREATEST(until_ms, $1) WHERE id = 1", [pending]);
    });
    if (this.pendingPause === pending) this.pendingPause = 0;
  }
  async cleanup(beforeDay: number) {
    await transaction(this.pool, async client => {
      await this.lock(client);
      await client.query("DELETE FROM device_quota WHERE day < $1", [beforeDay]);
      await client.query("DELETE FROM global_quota WHERE day < $1", [beforeDay]);
      await client.query("UPDATE quota_control SET until_ms = 0 WHERE id = 1 AND until_ms < $1", [beforeDay * DAY_MS]);
    });
  }
  close() { return this.pool.end(); }
}
