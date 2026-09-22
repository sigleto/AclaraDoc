import { createHmac } from "node:crypto";
import { DAY_MS } from "./quota-config.js";
import type { Quota } from "../../shared/quota.js";

export type DailyCounts = { device: number; global: number; cooldown: number };
export interface QuotaStore {
  read(hash: string, day: number): DailyCounts;
  // Both daily limits are checked and incremented within one transaction.
  consume(hash: string, day: number, deviceLimit: number, globalLimit: number, now: number): boolean;
  pause(until: number): void;
  cleanup(beforeDay: number): void;
  close(): void;
}
export function hashInstallation(id: string, secret: string) {
  return createHmac("sha256", secret).update(id.toLowerCase()).digest("hex");
}
export function quotaSnapshot(store: QuotaStore, hash: string, now: number, limit: number): Quota {
  const day = Math.floor(now / DAY_MS);
  return { limit, remaining: Math.max(0, limit - store.read(hash, day).device), resetAt: new Date((day + 1) * DAY_MS).toISOString() };
}
export class MemoryQuotaStore implements QuotaStore {
  private devices = new Map<number, Map<string, number>>();
  private globals = new Map<number, number>();
  private cooldown = 0;
  read(hash: string, day: number): DailyCounts {
    return { device: this.devices.get(day)?.get(hash) ?? 0, global: this.globals.get(day) ?? 0, cooldown: this.cooldown };
  }
  consume(hash: string, day: number, deviceLimit: number, globalLimit: number, now: number) {
    const current = this.read(hash, day);
    if (current.device >= deviceLimit || current.global >= globalLimit || now < current.cooldown) return false;
    const devices = this.devices.get(day) ?? new Map<string, number>();
    devices.set(hash, current.device + 1);
    this.devices.set(day, devices);
    this.globals.set(day, current.global + 1);
    return true;
  }
  pause(until: number) { this.cooldown = Math.max(this.cooldown, until); }
  cleanup(beforeDay: number) {
    for (const day of this.devices.keys()) if (day < beforeDay) this.devices.delete(day);
    for (const day of this.globals.keys()) if (day < beforeDay) this.globals.delete(day);
    if (this.cooldown < beforeDay * DAY_MS) this.cooldown = 0;
  }
  close() { /* Nothing to close. */ }
}
