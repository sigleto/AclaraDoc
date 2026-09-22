import { config as dotenv } from "dotenv";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { SQLiteQuotaStore } from "./sqlite-quota-store.js";
import { backendRoot } from "./paths.js";

dotenv({
  path: resolve(backendRoot, ".env"),
  quiet: true,
});
try {
  const config = readConfig(process.env);
  let quotaStore;
  if (config.ANALYSIS_MODE === "gemini") {
    const directory = resolve(backendRoot, ".data");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    quotaStore = new SQLiteQuotaStore(resolve(directory, "quotas.sqlite"), config.quotas.SQLITE_BUSY_TIMEOUT_MS);
  }
  const app = createApp(config, { quotaStore, log: metric => console.info(JSON.stringify(metric)) });
  const server = app.listen(config.PORT, config.HOST, () => {
    console.info(
      `AclaraDoc backend listo en puerto ${config.PORT}, modo ${config.ANALYSIS_MODE}.`,
    );
  });
  server.requestTimeout = config.quotas.UPLOAD_TIMEOUT_SECONDS * 1000;
  server.headersTimeout = Math.min(config.quotas.HEADERS_TIMEOUT_SECONDS, config.quotas.UPLOAD_TIMEOUT_SECONDS) * 1000;
  server.on("close", () => app.locals.dispose());
  server.on("error", () => {
    console.error(
      "No se pudo iniciar el servidor. Revisa el puerto y la configuración.",
    );
    process.exitCode = 1;
  });
} catch {
  console.error(
    "Configuración no válida. Revisa backend/.env.example, el modelo permitido y la confirmación de nivel gratuito.",
  );
  process.exitCode = 1;
}
