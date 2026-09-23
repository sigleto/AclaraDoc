import { z } from "zod";
import { isIP } from "node:net";
import { readQuotaConfig } from "./quota-config.js";
const envSchema = z.object({
  ANALYSIS_MODE: z.enum(["mock", "gemini"]).default("mock"),
  GEMINI_MODEL: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_FALLBACK_MODEL: z.enum(["", "gemini-3.5-flash-lite"]).default(""),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_ERROR_DIAGNOSTICS: z.enum(["true", "false"]).default("true"),
  QUOTA_HASH_SECRET: z.string().default(""),
  QUOTA_STORE: z.enum(["memory", "sqlite", "postgres"]).optional(),
  DATABASE_URL: z.string().default(""),
  TRUST_PROXY_CIDRS: z.string().default(""),
  FREE_TIER_CONFIRMED: z.enum(["true", "false"]).default("false"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:8081,http://127.0.0.1:8081"),
});
export function readConfig(env: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      "Configuración del servidor no válida. Revisa backend/.env.",
    );
  const config = parsed.data;
  const quotaStore = config.QUOTA_STORE ?? (config.ANALYSIS_MODE === "mock" ? "memory" : "sqlite");
  if (quotaStore === "postgres") {
    try {
      const url = new URL(config.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) throw new Error();
    } catch { throw new Error("PostgreSQL requiere DATABASE_URL válida en el entorno privado del backend."); }
  }
  const trustedProxies = config.TRUST_PROXY_CIDRS.split(",").map(value => value.trim()).filter(Boolean);
  if (trustedProxies.some(value => {
    const [address, prefix, extra] = value.split("/");
    const family = isIP(address);
    return !family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)));
  })) throw new Error("TRUST_PROXY_CIDRS solo admite IP o CIDR explícitos, nunca todos los proxies.");
  if (config.ANALYSIS_MODE !== "mock" && config.QUOTA_HASH_SECRET.length < 32)
    throw new Error("QUOTA_HASH_SECRET debe contener al menos 32 caracteres aleatorios en modo Gemini.");
  // The primary model is unchanged; only the explicitly configured fallback is allowed.
  if (config.GEMINI_MODEL !== "gemini-3.1-flash-lite")
    throw new Error("Esta prueba gratuita solo permite gemini-3.1-flash-lite.");
  if (
    config.ANALYSIS_MODE === "gemini" &&
    (!config.GEMINI_API_KEY.trim() || config.FREE_TIER_CONFIRMED !== "true")
  )
    throw new Error(
      "Para activar Gemini, configura la clave y confirma que su proyecto no tiene facturación habilitada.",
    );
  const origins = config.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    origins.some((origin) => {
      try {
        const u = new URL(origin);
        return !["http:", "https:"].includes(u.protocol) || u.origin !== origin;
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      "CORS_ORIGINS requiere orígenes HTTP exactos, sin comodines ni rutas.",
    );
  return { ...config, QUOTA_STORE: quotaStore, trustedProxies, origins, quotas: readQuotaConfig(env) };
}
export type Config = ReturnType<typeof readConfig>;
