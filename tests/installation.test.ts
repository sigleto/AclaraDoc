import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInstallation } from "../src/services/installation-core";
import { installationPattern } from "../shared/quota";

test("first open creates one UUID, concurrent requests reuse it, restart persists it", async () => {
  let stored: string | null = null;
  let writes = 0;
  const storage = { get: async () => stored, set: async (id: string) => { stored = id; writes++; } };
  const get = createInstallation(storage, randomUUID);
  const ids = await Promise.all([get(), get(), get()]);
  assert.match(ids[0], installationPattern);
  assert.equal(installationPattern.test(ids[0] + "\n"), false);
  assert.deepEqual(ids, [stored, stored, stored]);
  assert.equal(writes, 1);
  assert.equal(await createInstallation(storage, randomUUID)(), stored);
  assert.equal(writes, 1);
});
test("invalid stored identifier is replaced; storage failure never returns ephemeral UUID or details", async () => {
  let value = "old-invalid";
  const get = createInstallation({ get: async () => value, set: async id => { value = id; } }, randomUUID);
  assert.match(await get(), installationPattern);
  const failed = createInstallation({ get: async () => null, set: async () => { throw new Error("private-storage-data"); } }, randomUUID);
  await assert.rejects(failed(), error => error instanceof Error && !error.message.includes("private-storage-data"));
});
