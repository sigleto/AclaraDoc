import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export type RequestMetric = {
  requestId: string;
  fileType: "image" | "pdf" | "mixed" | "none";
  size: number;
  durationMs: number;
  code: string;
};

export function requestMetrics(now: () => number, write?: (metric: RequestMetric) => void): RequestHandler {
  return (_req, res, next) => {
    const requestId = randomUUID();
    const started = now();
    res.set("X-AclaraDoc-Request", requestId);
    const metric: RequestMetric = { requestId, fileType: "none", size: 0, durationMs: 0, code: "CANCELLED" };
    res.locals.metric = metric;
    let logged = false;
    const log = () => {
      if (logged) return;
      logged = true;
      const code = metric.code === "CANCELLED" && res.writableFinished ? `HTTP_${res.statusCode}` : metric.code;
      // Explicit allowlist; never serialize requests, responses or errors.
      try {
        write?.({ requestId, fileType: metric.fileType, size: metric.size, durationMs: Math.max(0, now() - started), code });
      } catch { /* Logging must not affect quota/accounting. */ }
    };
    res.once("finish", log);
    res.once("close", log);
    next();
  };
}
