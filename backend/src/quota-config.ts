// Invalid or missing settings fall back to these safe defaults. Upper bounds
// cannot be raised through the environment (especially the global budget).
import { LIMITS } from "../../shared/analysis.js";
export const quotaSettings = {
  IP_WINDOW_MINUTES: [15, 1, 60],
  IP_REQUEST_LIMIT: [5, 1, 100],
  DEVICE_DAILY_LIMIT: [3, 1, 20],
  GLOBAL_DAILY_LIMIT: [20, 1, 20],
  MAX_CONCURRENT_ANALYSES: [2, 1, 2],
  QUOTA_COOLDOWN_MINUTES: [60, 15, 1440],
  QUOTA_RETENTION_DAYS: [7, 1, 30],
  ANALYSIS_TIMEOUT_SECONDS: [45, 1, 45],
  UPLOAD_TIMEOUT_SECONDS: [30, 1, 30],
  HEADERS_TIMEOUT_SECONDS: [15, 1, 15],
  MAX_OUTPUT_TOKENS: [6000, 512, 6000],
  MAX_RESPONSE_CHARS: [70000, 1000, 70000],
  MAX_FILES: [LIMITS.files, 1, LIMITS.files],
  MAX_PAGES: [LIMITS.pages, 1, LIMITS.pages],
  MAX_FILE_BYTES: [LIMITS.fileBytes, 1024, LIMITS.fileBytes],
  MAX_TOTAL_BYTES: [LIMITS.totalBytes, 1024, LIMITS.totalBytes],
  MULTIPART_HEADER_PAIRS: [30, 10, 30],
  PDF_TIMEOUT_MS: [3000, 100, 3000],
  PDF_OLD_MEMORY_MB: [64, 16, 64],
  PDF_YOUNG_MEMORY_MB: [16, 4, 16],
  QUOTA_CLEANUP_MINUTES: [1, 1, 60],
  SQLITE_BUSY_TIMEOUT_MS: [1000, 100, 3000],
} as const;
export function readQuotaConfig(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(Object.entries(quotaSettings).map(([key, [fallback, min, max]]) => {
    const raw = env[key];
    const value = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
    return [key, Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback];
  })) as Record<keyof typeof quotaSettings, number>;
}
export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;
export const defaultLimits = readQuotaConfig({});
