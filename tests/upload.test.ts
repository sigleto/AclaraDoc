import { test } from "node:test";
import assert from "node:assert/strict";
import { installFormDataPatch } from "../node_modules/expo/src/winter/FormData";
import { convertFormDataAsync } from "../node_modules/expo/src/winter/fetch/convertFormData";
import { appendNativeUpload } from "../src/services/upload";
import { LIMITS } from "../shared/analysis";

// Node has no native FormData. Apply Expo's installed patch to its parts store
// so this test exercises the same serializer that rejected the mobile upload.
class PartsStore {
  _parts: unknown[] = [];
}
const NativeFormData = installFormDataPatch(PartsStore as unknown as typeof FormData);
const source = {
  exists: true,
  size: 3,
  bytes: async () => new Uint8Array([65, 66, 67]),
};

test("Expo 57 rejects the previous URI-only upload before networking", async () => {
  const body = new NativeFormData();
  body.append("files", { uri: "file:///private/photo.jpg", type: "image/jpeg", name: "pagina-1.jpg" });
  await assert.rejects(convertFormDataAsync(body as unknown as FormData), /Unsupported FormDataPart/);
});

test("native files serialize with bytes, MIME and generated names only", async () => {
  const body = new NativeFormData() as unknown as FormData;
  let reads = 0;
  const file = { ...source, uri: "file:///private/original.jpg", name: "original.jpg", bytes: async () => { reads++; return source.bytes(); } };
  assert.equal(appendNativeUpload(body, file, "pagina-1.jpg", "image/jpeg"), 3);
  appendNativeUpload(body, source, "pagina-2.pdf", "application/pdf");
  assert.equal(reads, 0);
  const encoded = await convertFormDataAsync(body);
  assert.equal(reads, 1);
  const text = new TextDecoder().decode(encoded.body);
  assert.ok(!text.includes("private"));
  assert.ok(!text.includes("original.jpg"));
  const parsed = await new Response(new Uint8Array(encoded.body).buffer, {
    headers: { "Content-Type": `multipart/form-data; boundary=${encoded.boundary}` },
  }).formData();
  const files = parsed.getAll("files") as unknown as File[];
  assert.deepEqual(files.map((f) => [f.name, f.type]), [
    ["pagina-1.jpg", "image/jpeg"], ["pagina-2.pdf", "application/pdf"],
  ]);
  assert.deepEqual(new Uint8Array(await files[0].arrayBuffer()), await source.bytes());
});

test("missing or oversized native files fail before reading bytes", () => {
  const body = new NativeFormData() as unknown as FormData;
  const unreadable = { ...source, bytes: async () => { throw new Error("Must not read"); } };
  assert.throws(() => appendNativeUpload(body, { ...unreadable, exists: false }, "pagina-1.jpg", "image/jpeg"), /ya no está disponible/);
  assert.throws(() => appendNativeUpload(body, { ...unreadable, size: LIMITS.fileBytes + 1 }, "pagina-1.jpg", "image/jpeg"), /4 MB/);
  assert.equal(Array.from(body.entries()).length, 0);
});
