import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { AppError } from "./errors.js";

const pdfModule = createRequire(import.meta.url).resolve("pdf-lib");

// Isolate the untrusted PDF parser: bounded time/memory and no parser output in logs.
// The worker never creates files; termination releases its document and parser state.
export function countPdfPages(
  buffer: Buffer,
  signal?: AbortSignal,
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError("CANCELLED", 499));
    const worker = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      const { PDFDocument } = require(workerData.module);
      (async () => {
        try {
          const pdf = await PDFDocument.load(workerData.bytes, { throwOnInvalidObject: true, updateMetadata: false });
          parentPort.postMessage(pdf.getPageCount());
        } catch { parentPort.postMessage(null); }
        finally { workerData.bytes.fill(0); }
      })();
    `,
      {
        eval: true,
        execArgv: [],
        workerData: { module: pdfModule, bytes: buffer },
        stdout: true,
        stderr: true,
        resourceLimits: {
          maxOldGenerationSizeMb: 64,
          maxYoungGenerationSizeMb: 16,
        },
      },
    );
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (pages?: number, error?: AppError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      void worker.terminate().then(() => {
        if (error || !pages || !Number.isInteger(pages))
          reject(error ?? new AppError("INVALID_FILE", 415));
        else resolve(pages);
      });
    };
    const cancel = () => finish(undefined, new AppError("CANCELLED", 499));
    const timer = setTimeout(
      () => finish(undefined, new AppError("INVALID_FILE", 415)),
      3000,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.once("message", (value: unknown) =>
      finish(typeof value === "number" ? value : undefined),
    );
    worker.once("error", () => finish());
    worker.once("exit", () => finish());
  });
}
