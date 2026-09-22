import { useEffect, useState } from "react";
import type { Quota } from "../../shared/quota";
import { Copy } from "./ui";

export function QuotaStatus({ quota }: { quota: Quota | null }) {
  const [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!quota || Date.parse(quota.resetAt) <= time) return null;
  return (
    <Copy>
      Análisis restantes hoy en este dispositivo: {quota.remaining} de {quota.limit}.
      {" "}Se renuevan a las {new Date(quota.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
    </Copy>
  );
}
