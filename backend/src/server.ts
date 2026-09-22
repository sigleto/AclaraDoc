import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createQuotaStore } from "./create-quota-store.js";
import { DAY_MS } from "./quota-config.js";
import { backendRoot } from "./paths.js";

dotenv({ path: resolve(backendRoot, ".env"), quiet: true });
async function main() {
  const config = readConfig(process.env);
  const quotaStore = await createQuotaStore(config);
  try {
    // Missing migrations or database access prevent readiness; no memory fallback.
    await quotaStore.cleanup(Math.floor(Date.now() / DAY_MS) - config.quotas.QUOTA_RETENTION_DAYS + 1);
    await quotaStore.read("0".repeat(64), Math.floor(Date.now() / DAY_MS));
  } catch (error) { await quotaStore.close(); throw error; }
  const app = createApp(config, { quotaStore, log: metric => console.info(JSON.stringify(metric)) });
  const server = app.listen(config.PORT, config.HOST, () => {
    console.info(`AclaraDoc backend listo en puerto ${config.PORT}, modo ${config.ANALYSIS_MODE}.`);
  });
  server.requestTimeout = config.quotas.UPLOAD_TIMEOUT_SECONDS * 1000;
  server.headersTimeout = Math.min(config.quotas.HEADERS_TIMEOUT_SECONDS, config.quotas.UPLOAD_TIMEOUT_SECONDS) * 1000;
  let closing = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close();
    // Closing sockets aborts the request's provider and PDF work.
    deadline = setTimeout(() => server.closeAllConnections(), 20_000);
    deadline.unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.on("close", () => {
    clearTimeout(deadline);
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
    void Promise.resolve(app.locals.dispose()).catch(() => { process.exitCode = 1; });
  });
  server.on("error", () => {
    console.error("No se pudo iniciar el servidor. Revisa el puerto y la configuración.");
    process.exitCode = 1;
    shutdown();
  });
}
void main().catch(() => {
  console.error("No se pudo iniciar el backend. Revisa la configuración privada, el almacenamiento y las migraciones.");
  process.exitCode = 1;
});
