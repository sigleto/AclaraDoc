import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

// This maintenance command edits only QUOTA_HASH_SECRET. Never output the
// contents, existing credentials, newly generated secret, or raw exceptions.
try {
  const path = fileURLToPath(new URL("../.env", import.meta.url));
  const content = readFileSync(path, "utf8");
  const existing = parse(content).QUOTA_HASH_SECRET;
  if (existing && existing.length >= 32) {
    console.info("El secreto de cuotas ya está configurado; se conserva.");
  } else {
    const line = `QUOTA_HASH_SECRET=${randomBytes(32).toString("hex")}`;
    const pattern = /^(?:export\s+)?QUOTA_HASH_SECRET\s*=.*$/gm;
    const updated = pattern.test(content) ? content.replace(pattern, line) : content + "\n" + line + "\n";
    writeFileSync(path, updated, { encoding: "utf8", mode: 0o600 });
    console.info("Se ha configurado el secreto local de cuotas sin mostrarlo.");
  }
} catch {
  console.error("No se pudo preparar el secreto. Comprueba que backend/.env existe y permite escritura.");
  process.exitCode = 1;
}
