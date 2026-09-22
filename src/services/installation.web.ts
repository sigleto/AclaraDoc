import { createInstallation } from "./installation-core";

// SecureStore is native-only. Web uses storage scoped to this browser/origin;
// this identifier has no authentication value and is not a device identifier.
const KEY = "aclaradoc.installation.v1";
export const getInstallation = createInstallation({
  get: async () => localStorage.getItem(KEY),
  set: async value => localStorage.setItem(KEY, value),
}, () => globalThis.crypto.randomUUID());
