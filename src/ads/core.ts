export const ADS_STORAGE_KEY = 'aclaradoc.ads.frequency.v1';
export const COOLDOWN_MS = 5 * 60_000;
const MAX_AGE_MS = 55 * 60_000;
const RETRY_MS = 60_000;

export interface ConsentInfo {
  canRequestAds: boolean;
  privacyOptionsRequirementStatus: string;
}
export interface AdHandle {
  load(): void;
  show(): Promise<unknown>;
  destroy(): void;
}
export interface AdsDriver {
  updateConsent(): Promise<ConsentInfo>;
  showRequiredConsent(): Promise<ConsentInfo>;
  getConsent(): Promise<ConsentInfo>;
  privacyOptions(): Promise<ConsentInfo>;
  initialize(): Promise<unknown>;
  interstitial(events: { loaded(): void; ended(): void }): AdHandle;
}
interface Frequency { completed: number; lastAttemptAt: number }
export interface AdsState { ready: boolean; privacyRequired: boolean; resolving: boolean }

export function bannerAllowed(path: string, blocked: boolean): boolean {
  return !blocked && (path === '/' || path === '/historial');
}

function decodeFrequency(raw: string | null): Frequency {
  if (raw === null) return { completed: 0, lastAttemptAt: 0 };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid frequency');
  const { completed, lastAttemptAt } = value as Frequency;
  if (!Number.isInteger(completed) || completed < 0 || completed > 3 ||
      !Number.isSafeInteger(lastAttemptAt) || lastAttemptAt < 0) throw new Error('Invalid frequency');
  return { completed, lastAttemptAt };
}

// SDK receives no application objects, document fields, installation IDs or history.
export class AdsController {
  private state: AdsState = { ready: false, privacyRequired: false, resolving: false };
  private listeners = new Set<() => void>();
  private started?: Promise<void>;
  private initialized?: Promise<unknown>;
  private frequency?: Frequency;
  private writes: Promise<void>;
  private pendingWrites = 0;
  private ad?: AdHandle;
  private loadedAt: number | null = null;
  private nextLoadAt = 0;
  private presenting = false;
  private privacyBusy = false;
  private generation = 0;
  private deferredForm = false;
  private loadingAt = 0;

  constructor(
    private driver: AdsDriver | null,
    private storage: { get(): Promise<string | null>; set(value: string): Promise<void> },
    private now = Date.now,
  ) {
    this.writes = storage.get().then(raw => { this.frequency = decodeFrequency(raw); }).catch(() => {
      // Fail closed for interstitials; advertising never breaks document use.
      this.frequency = undefined;
    });
  }

  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<AdsState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  start(canPresent: () => boolean): Promise<void> {
    if (!this.started) this.started = this.resolveConsent(canPresent).finally(() => {
      if (this.deferredForm) this.started = undefined;
    });
    return this.started;
  }
  private async resolveConsent(canPresent: () => boolean) {
    if (!this.driver) return;
    this.update({ resolving: true });
    try {
      await this.driver.updateConsent();
      // An update may finish after the user starts selecting a document.
      this.deferredForm = !canPresent();
      if (!this.deferredForm) await this.driver.showRequiredConsent();
      await this.applyConsent();
    } catch {
      // UMP can authorize a previous session after an offline update failure.
      try { await this.applyConsent(); } catch { this.update({ ready: false }); }
    } finally { this.update({ resolving: false }); }
  }
  private async applyConsent() {
    const info = await this.driver!.getConsent();
    this.update({ ready: false, privacyRequired: info.privacyOptionsRequirementStatus === 'REQUIRED' });
    if (!info.canRequestAds) return;
    this.initialized ??= this.driver!.initialize();
    await this.initialized;
    this.update({ ready: true });
  }
  async openPrivacy(): Promise<boolean> {
    if (!this.driver || this.privacyBusy || this.state.resolving || this.presenting) return false;
    this.privacyBusy = true;
    this.update({ ready: false, resolving: true });
    this.dropAd();
    try {
      await this.driver.privacyOptions();
      await this.applyConsent();
      return true;
    } catch {
      // No old inventory is reused after changing (or failing to change) consent.
      this.update({ ready: false });
      return false;
    } finally {
      this.privacyBusy = false;
      this.update({ resolving: false });
    }
  }
  recordCompletion(): Promise<void> {
    return this.writeFrequency(() => {
      if (this.frequency) this.frequency.completed = Math.min(3, this.frequency.completed + 1);
    });
  }
  private writeFrequency(change: () => void): Promise<void> {
    this.pendingWrites++;
    this.writes = this.writes.then(async () => {
      if (!this.frequency) return;
      change();
      await this.storage.set(JSON.stringify(this.frequency));
    }).catch(() => { this.frequency = undefined; }).finally(() => { this.pendingWrites--; });
    return this.writes;
  }
  private dropAd() {
    this.generation++;
    this.loadedAt = null;
    this.ad?.destroy();
    this.ad = undefined;
  }
  preload() {
    if (!this.driver || !this.state.ready || this.state.resolving || this.presenting) return;
    if (this.ad && this.loadedAt === null && this.now() - this.loadingAt >= RETRY_MS) this.dropAd();
    if (this.loadedAt !== null && this.now() - this.loadedAt >= MAX_AGE_MS) this.dropAd();
    if (this.ad || this.now() < this.nextLoadAt) return;
    const generation = ++this.generation;
    this.nextLoadAt = this.now() + RETRY_MS;
    this.loadingAt = this.now();
    try {
      this.ad = this.driver.interstitial({
        loaded: () => { if (generation === this.generation) this.loadedAt = this.now(); },
        ended: () => {
          if (generation !== this.generation) return;
          this.presenting = false;
          this.dropAd();
          this.nextLoadAt = this.now() + RETRY_MS;
        },
      });
      this.ad.load();
    } catch { this.dropAd(); }
  }
  // Navigation never waits for loading, showing, dismissal or native SDK promises.
  leaveResult(navigate: () => void, stillAllowed: () => boolean): void {
    if (this.presenting) { navigate(); return; }
    const time = this.now();
    if (!this.state.ready || this.state.resolving || !this.frequency || this.pendingWrites ||
        this.frequency.completed < 3 || !this.ad || this.loadedAt === null ||
        time - this.loadedAt >= MAX_AGE_MS ||
        (this.frequency.lastAttemptAt !== 0 && time - this.frequency.lastAttemptAt < COOLDOWN_MS)) {
      navigate();
      return;
    }
    this.presenting = true;
    const ad = this.ad;
    const generation = this.generation;
    // Persist the reservation before show, including a failed presentation.
    const write = this.writeFrequency(() => {
      this.frequency = { completed: 0, lastAttemptAt: time };
    });
    let finished = false;
    const finish = (saved: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (!stillAllowed()) { this.presenting = false; return; }
      if (saved && this.frequency && this.state.ready && generation === this.generation) {
        const failed = () => {
          if (generation !== this.generation) return;
          this.presenting = false;
          this.dropAd();
          this.nextLoadAt = this.now() + RETRY_MS;
        };
        try { void ad.show().catch(failed); } catch { failed(); }
      } else { this.presenting = false; }
      navigate();
    };
    const timer = setTimeout(() => finish(false), 500);
    void write.then(() => finish(true));
  }
}
