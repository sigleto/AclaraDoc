import { config as dotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

dotenv({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
try {
  const config = readConfig(process.env);
  const server = createApp(config).listen(config.PORT, config.HOST, () => {
    console.info(
      `AclaraDoc backend listo en puerto ${config.PORT}, modo ${config.ANALYSIS_MODE}.`,
    );
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
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
