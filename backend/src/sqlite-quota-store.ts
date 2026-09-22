import { DatabaseSync } from "node:sqlite";
import type { DailyCounts, QuotaStore } from "./quota-store.js";
import { DAY_MS, defaultLimits, quotaSettings } from "./quota-config.js";

export class SQLiteQuotaStore implements QuotaStore {
  private db: DatabaseSync;
  constructor(path: string, busyTimeoutMs = defaultLimits.SQLITE_BUSY_TIMEOUT_MS) {
    const [, min, max] = quotaSettings.SQLITE_BUSY_TIMEOUT_MS;
    if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < min || busyTimeoutMs > max) throw new Error("Invalid quota timeout");
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=${busyTimeoutMs}`);
    this.db.exec(`PRAGMA journal_mode=WAL;
      PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS device_quota(hash TEXT NOT NULL, day INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(hash, day));
      CREATE TABLE IF NOT EXISTS global_quota(day INTEGER PRIMARY KEY, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cooldown(until INTEGER NOT NULL);
      INSERT INTO cooldown SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM cooldown);`);
  }
  read(hash: string, day: number): DailyCounts {
    const device = this.db.prepare("SELECT count FROM device_quota WHERE hash=? AND day=?").get(hash, day);
    const global = this.db.prepare("SELECT count FROM global_quota WHERE day=?").get(day);
    const cooldown = this.db.prepare("SELECT until FROM cooldown").get();
    return { device: Number(device?.count ?? 0), global: Number(global?.count ?? 0), cooldown: Number(cooldown?.until ?? 0) };
  }
  consume(hash: string, day: number, deviceLimit: number, globalLimit: number, now: number) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.read(hash, day);
      if (current.device >= deviceLimit || current.global >= globalLimit || now < current.cooldown) {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.db.prepare("INSERT INTO device_quota(hash,day,count) VALUES(?,?,1) ON CONFLICT(hash,day) DO UPDATE SET count=count+1").run(hash, day);
      this.db.prepare("INSERT INTO global_quota(day,count) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1").run(day);
      this.db.exec("COMMIT");
      return true;
    } catch {
      this.db.exec("ROLLBACK");
      throw new Error("Quota storage unavailable");
    }
  }
  pause(until: number) { this.db.prepare("UPDATE cooldown SET until=MAX(until,?)").run(until); }
  cleanup(beforeDay: number) {
    const devices = this.db.prepare("DELETE FROM device_quota WHERE day<?").run(beforeDay);
    const global = this.db.prepare("DELETE FROM global_quota WHERE day<?").run(beforeDay);
    this.db.prepare("UPDATE cooldown SET until=0 WHERE until<?").run(beforeDay * DAY_MS);
    if (Number(devices.changes) + Number(global.changes) > 0) this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  close() { if (this.db.isOpen) this.db.close(); }
}
