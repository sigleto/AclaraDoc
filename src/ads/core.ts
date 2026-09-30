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
export interface AdsState { ready: boolean; privacyRequired: boolean; resolving: boolean }

export function bannerAllowed(path: string, blocked: boolean): boolean {
  return !blocked && (path === '/' || path === '/historial');
}

// SDK receives no application objects, document fields, installation IDs or history.
export class AdsController {
  private state: AdsState = { ready: false, privacyRequired: false, resolving: false };
  private listeners = new Set<() => void>();
  private started?: Promise<void>;
  private initialized?: Promise<unknown>;
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
    private now = Date.now,
  ) {}

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
          this.nextLoadAt = this.now();
          setTimeout(() => this.preload(), 0);
        },
      });
      this.ad.load();
    } catch { this.dropAd(); }
  }
  // The native overlay is requested first; the result route is then placed behind it.
  // Missing inventory, consent or SDK failures always continue to the result.
  showBeforeResult(navigate: () => void, canShow: () => boolean): void {
    if (this.presenting) { navigate(); return; }
    const time = this.now();
    if (!this.state.ready || this.state.resolving || !this.ad || this.loadedAt === null ||
        time - this.loadedAt >= MAX_AGE_MS || !canShow()) {
      navigate();
      return;
    }
    this.presenting = true;
    const ad = this.ad;
    const generation = this.generation;
    const failed = () => {
      if (generation !== this.generation) return;
      this.presenting = false;
      this.dropAd();
      this.nextLoadAt = this.now() + RETRY_MS;
    };
    try { void ad.show().catch(failed); } catch { failed(); }
    navigate();
  }
}
