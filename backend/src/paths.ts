import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Stable for both tsx src/server.ts and the compiled dist/backend/src/server.js.
function findBackendRoot() {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (dirname(directory) !== directory) {
    const packagePath = join(directory, "package.json");
    if (existsSync(packagePath) && JSON.parse(readFileSync(packagePath, "utf8")).name === "aclaradoc-backend") return directory;
    directory = dirname(directory);
  }
  throw new Error("Backend directory unavailable");
}
export const backendRoot = findBackendRoot();
