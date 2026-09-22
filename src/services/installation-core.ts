import { installationPattern } from "../../shared/quota";

export interface InstallationStorage {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}
export function createInstallation(storage: InstallationStorage, uuid: () => string) {
  let pending: Promise<string> | undefined;
  return () => {
    pending ??= (async () => {
      try {
        const stored = await storage.get();
        if (stored && installationPattern.test(stored)) return stored.toLowerCase();
        const generated = uuid();
        if (!installationPattern.test(generated)) throw new Error();
        await storage.set(generated);
        return generated;
      } catch {
        pending = undefined;
        throw new Error("No se pudo preparar esta instalación. Cierra y vuelve a abrir la aplicación.");
      }
    })();
    return pending;
  };
}
