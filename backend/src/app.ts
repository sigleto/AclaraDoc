import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import {
  mockAnalysis,
  validateAnalysis,
} from "../../shared/analysis.js";
import { createUpload, disposeUploads, validateUploads } from "./uploads.js";
import { AppError, providerError } from "./errors.js";
import type { Config } from "./config.js";
import { createGeminiAnalyzer, type Analyze } from "./gemini.js";
import { installationPattern } from "../../shared/quota.js";
import { DAY_MS, MINUTE_MS } from "./quota-config.js";
import { hashInstallation, MemoryQuotaStore, quotaSnapshot, type QuotaStore } from "./quota-store.js";
import { requestMetrics, type RequestMetric } from "./request-metrics.js";
export type { RequestMetric } from "./request-metrics.js";

export function createApp(
  config: Config,
  options: {
    analyze?: Analyze;
    now?: () => number;
    timeoutMs?: number;
    ipLimit?: number;
    quotaStore?: QuotaStore;
    log?: (metric: RequestMetric) => void;
  } = {},
) {
  const app = express();
  const now = options.now ?? Date.now;
  const analyze =
    options.analyze ??
    (config.ANALYSIS_MODE === "mock"
      ? async () => mockAnalysis()
      : createGeminiAnalyzer(config));
  const upload = createUpload(config.quotas);
  let active = 0;
  const store = options.quotaStore ?? new MemoryQuotaStore();
  const limits = config.quotas;
  const ips = new Map<string, { count: number; until: number }>();
  const cleanup = () => {
    store.cleanup(Math.floor(now() / DAY_MS) - limits.QUOTA_RETENTION_DAYS + 1);
    for (const [ip, quota] of ips) if (quota.until <= now()) ips.delete(ip);
  };
  cleanup();
  const cleanupTimer = setInterval(() => {
    try { cleanup(); } catch { /* Each admission checks again and fails closed. */ }
  }, limits.QUOTA_CLEANUP_MINUTES * MINUTE_MS);
  cleanupTimer.unref();
  app.locals.dispose = () => { clearInterval(cleanupTimer); store.close(); };
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(helmet());
  app.use(requestMetrics(now, options.log));
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    cors({
      origin(origin, cb) {
        cb(
          origin && !config.origins.includes(origin)
            ? new AppError("ORIGIN_DENIED", 403)
            : null,
          true,
        );
      },
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "X-AclaraDoc-Consent", "X-AclaraDoc-Installation"],
      exposedHeaders: ["Retry-After", "X-AclaraDoc-Request"],
      credentials: false,
    }),
  );
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", mode: config.ANALYSIS_MODE, limits: { files: limits.MAX_FILES, pages: limits.MAX_PAGES, fileBytes: limits.MAX_FILE_BYTES, totalBytes: limits.MAX_TOTAL_BYTES }, quotas: limits });
  });
  app.post("/api/analyze", (req, res, next) => {
    const metric = res.locals.metric as RequestMetric;
    const requestId = metric.requestId;
    if (req.get("X-AclaraDoc-Consent") !== "accepted-v1")
      return next(new AppError("CONSENT_REQUIRED", 400));
    const installation = req.get("X-AclaraDoc-Installation") ?? "";
    if (!installationPattern.test(installation)) return next(new AppError("INSTALLATION_REQUIRED", 400));
    const hash = hashInstallation(installation, config.QUOTA_HASH_SECRET);
    const real = config.ANALYSIS_MODE === "gemini";
    const snapshot = () => real ? quotaSnapshot(store, hash, now(), limits.DEVICE_DAILY_LIMIT) : undefined;
    const rejectLimit = (code: "IP_LIMIT" | "DEVICE_LIMIT" | "GLOBAL_LIMIT" | "QUOTA_EXHAUSTED" | "BUSY", until: number) => {
      res.locals.retryAfterSeconds = Math.max(1, Math.ceil((until - now()) / 1000));
      res.set("Retry-After", String(res.locals.retryAfterSeconds));
      res.locals.quota = snapshot();
      return new AppError(code, 429);
    };
    const checkLimits = () => {
      const time = now();
      const day = Math.floor(time / DAY_MS);
      const counts = store.read(hash, day);
      if (time < counts.cooldown) throw rejectLimit("QUOTA_EXHAUSTED", counts.cooldown);
      if (!real) return;
      if (counts.global >= limits.GLOBAL_DAILY_LIMIT) throw rejectLimit("GLOBAL_LIMIT", (day + 1) * DAY_MS);
      if (counts.device >= limits.DEVICE_DAILY_LIMIT) throw rejectLimit("DEVICE_LIMIT", (day + 1) * DAY_MS);
      const ip = ips.get(req.ip ?? "unknown");
      if (ip && ip.until > time && ip.count >= (options.ipLimit ?? limits.IP_REQUEST_LIMIT)) throw rejectLimit("IP_LIMIT", ip.until);
    };
    if (!req.is("multipart/form-data"))
      return next(new AppError("INVALID_REQUEST", 400));
    try { cleanup(); checkLimits(); } catch (error) { return next(error); }
    if (active >= limits.MAX_CONCURRENT_ANALYSES) return next(rejectLimit("BUSY", now() + limits.ANALYSIS_TIMEOUT_SECONDS * 1000));
    active++;
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);
    req.on("aborted", onClose);
    // Covers an incomplete upload too. No files are ever created on disk.
    const uploadTimer = setTimeout(() => {
      controller.abort();
      req.destroy();
    }, limits.UPLOAD_TIMEOUT_SECONDS * 1000);
    uploadTimer.unref();
    upload(req, res, (error) => {
      clearTimeout(uploadTimer);
      void (async () => {
        const files = Array.isArray(req.files) ? req.files : [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        let providerStarted = false;
        try {
          if (error) throw error;
          if (controller.signal.aborted) throw new AppError("CANCELLED", 499);
          await validateUploads(files, controller.signal, limits);
          metric.size = files.reduce((sum, file) => sum + file.size, 0);
          const pdf = files.some(file => file.mimetype === "application/pdf");
          const image = files.some(file => file.mimetype.startsWith("image/"));
          metric.fileType = pdf && image ? "mixed" : pdf ? "pdf" : "image";
          if (controller.signal.aborted) throw new AppError("CANCELLED", 499);
          checkLimits();
          if (real) {
            const time = now();
            if (!store.consume(hash, Math.floor(time / DAY_MS), limits.DEVICE_DAILY_LIMIT, limits.GLOBAL_DAILY_LIMIT, time)) {
              checkLimits();
              throw new AppError("UNAVAILABLE", 503);
            }
            const key = req.ip ?? "unknown";
            const ip = ips.get(key);
            ips.set(key, ip && ip.until > time ? { ...ip, count: ip.count + 1 } : { count: 1, until: time + limits.IP_WINDOW_MINUTES * MINUTE_MS });
          }
          const analysis = await new Promise<Awaited<ReturnType<Analyze>>>(
            (resolve, reject) => {
              const abort = () => reject(new AppError("CANCELLED", 499));
              controller.signal.addEventListener("abort", abort, {
                once: true,
              });
              timer = setTimeout(() => {
                reject(new AppError("TIMEOUT", 504));
                controller.abort();
              }, options.timeoutMs ?? limits.ANALYSIS_TIMEOUT_SECONDS * 1000);
              providerStarted = true;
              analyze(files, controller.signal)
                .then(resolve, reject)
                .finally(() =>
                  controller.signal.removeEventListener("abort", abort),
                );
            },
          );
          let validated;
          try {
            validated = validateAnalysis(analysis);
          } catch {
            throw new AppError("INVALID_RESPONSE", 502);
          }
          metric.code = "OK";
          res.json({
            id: requestId,
            quota: snapshot(),
            createdAt: new Date(now()).toISOString(),
            simulated: config.ANALYSIS_MODE === "mock",
            analysis: validated,
          });
        } catch (error) {
          const safeError =
            error instanceof multer.MulterError || error instanceof AppError
              ? error
              : providerError(error);
          if (
            safeError instanceof AppError &&
            providerStarted &&
            safeError.code === "QUOTA_EXHAUSTED"
          ) {
            const until = now() + limits.QUOTA_COOLDOWN_MINUTES * MINUTE_MS;
            store.pause(until);
            rejectLimit("QUOTA_EXHAUSTED", until);
          }
          res.locals.quota = snapshot();
          if (!res.destroyed && !res.headersSent) next(safeError);
        } finally {
          if (timer) clearTimeout(timer);
          disposeUploads(files);
          req.files = [];
          active--;
          res.off("close", onClose);
          req.off("aborted", onClose);
        }
      })().catch(() => {
        if (!res.destroyed && !res.headersSent) next(new AppError("UNAVAILABLE", 503));
      });
    });
  });
  app.use((_req, _res, next) => next(new AppError("INVALID_REQUEST", 404)));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    let safe =
      error instanceof AppError ? error : new AppError("UNAVAILABLE", 503);
    if (error instanceof multer.MulterError) {
      safe = new AppError(
        error.code === "LIMIT_FILE_SIZE"
          ? "FILE_TOO_LARGE"
          : ["LIMIT_FILE_COUNT", "LIMIT_PART_COUNT"].includes(error.code)
            ? "TOO_MANY_PAGES"
            : "INVALID_REQUEST",
        error.code === "LIMIT_FILE_SIZE" ||
          error.code === "LIMIT_FILE_COUNT" ||
          error.code === "LIMIT_PART_COUNT"
          ? 413
          : 400,
      );
    }
    if (res.locals.metric) res.locals.metric.code = safe.code;
    res
      .status(safe.status)
      .json({ error: { code: safe.code, message: safe.message, retryAfterSeconds: res.locals.retryAfterSeconds }, quota: res.locals.quota });
  };
  app.use(errors);
  return app;
}
