import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { randomUUID } from "node:crypto";
import {
  LIMITS,
  mockAnalysis,
  validateAnalysis,
} from "../../shared/analysis.js";
import { createUpload, disposeUploads, validateUploads } from "./uploads.js";
import { AppError, providerError } from "./errors.js";
import type { Config } from "./config.js";
import { createGeminiAnalyzer, type Analyze } from "./gemini.js";

export function createApp(
  config: Config,
  options: {
    analyze?: Analyze;
    now?: () => number;
    timeoutMs?: number;
    ipLimit?: number;
  } = {},
) {
  const app = express();
  const now = options.now ?? Date.now;
  const analyze =
    options.analyze ??
    (config.ANALYSIS_MODE === "mock"
      ? async () => mockAnalysis()
      : createGeminiAnalyzer(config));
  const upload = createUpload();
  let active = 0;
  let blockedUntil = 0;
  let day = Math.floor(now() / 86_400_000);
  let calls = 0;
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(helmet());
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
      allowedHeaders: ["Content-Type", "X-AclaraDoc-Consent"],
      credentials: false,
    }),
  );
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", mode: config.ANALYSIS_MODE, limits: LIMITS });
  });
  app.use(
    "/api/analyze",
    rateLimit({
      windowMs: 15 * 60_000,
      limit: options.ipLimit ?? 5,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new AppError("RATE_LIMITED", 429)),
    }),
  );
  app.post("/api/analyze", (req, res, next) => {
    if (req.get("X-AclaraDoc-Consent") !== "accepted-v1")
      return next(new AppError("CONSENT_REQUIRED", 400));
    if (!req.is("multipart/form-data"))
      return next(new AppError("INVALID_REQUEST", 400));
    if (now() < blockedUntil) {
      res.set("Retry-After", String(Math.ceil((blockedUntil - now()) / 1000)));
      return next(new AppError("QUOTA_EXHAUSTED", 429));
    }
    if (active >= 2) return next(new AppError("RATE_LIMITED", 429));
    const today = Math.floor(now() / 86_400_000);
    if (today !== day) {
      day = today;
      calls = 0;
    }
    if (config.ANALYSIS_MODE === "gemini" && calls >= 20)
      return next(new AppError("QUOTA_EXHAUSTED", 429));
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
    }, 30_000);
    uploadTimer.unref();
    upload(req, res, (error) => {
      clearTimeout(uploadTimer);
      void (async () => {
        const files = Array.isArray(req.files) ? req.files : [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          if (error) throw error;
          if (controller.signal.aborted) throw new AppError("CANCELLED", 499);
          await validateUploads(files, controller.signal);
          if (controller.signal.aborted) throw new AppError("CANCELLED", 499);
          if (
            now() < blockedUntil ||
            (config.ANALYSIS_MODE === "gemini" && calls >= 20)
          )
            throw new AppError("QUOTA_EXHAUSTED", 429);
          if (config.ANALYSIS_MODE === "gemini") calls++;
          const analysis = await new Promise<Awaited<ReturnType<Analyze>>>(
            (resolve, reject) => {
              const abort = () => reject(new AppError("CANCELLED", 499));
              controller.signal.addEventListener("abort", abort, {
                once: true,
              });
              timer = setTimeout(() => {
                reject(new AppError("TIMEOUT", 504));
                controller.abort();
              }, options.timeoutMs ?? 45_000);
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
          res.json({
            id: randomUUID(),
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
            safeError.code === "QUOTA_EXHAUSTED"
          ) {
            blockedUntil = now() + 15 * 60_000;
            res.set("Retry-After", "900");
          }
          if (!res.destroyed && !res.headersSent) next(safeError);
        } finally {
          if (timer) clearTimeout(timer);
          disposeUploads(files);
          req.files = [];
          active--;
          res.off("close", onClose);
          req.off("aborted", onClose);
        }
      })();
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
    res
      .status(safe.status)
      .json({ error: { code: safe.code, message: safe.message } });
  };
  app.use(errors);
  return app;
}
