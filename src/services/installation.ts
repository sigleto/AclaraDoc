import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { createInstallation } from "./installation-core";

const KEY = "aclaradoc.installation.v1";
export const getInstallation = createInstallation({
  get: () => SecureStore.getItemAsync(KEY),
  set: value => SecureStore.setItemAsync(KEY, value, { requireAuthentication: false }),
}, randomUUID);
