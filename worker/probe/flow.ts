// Isolated viability probe. No deployment entry point, secrets, D1 or real network.
import { Buffer } from "node:buffer";
import { GoogleGenAI } from "@google/genai/web";
import { LIMITS, mockAnalysis, validateAnalysis } from "../../shared/analysis.js";
import { geminiResponseSchema } from "../../backend/src/response-schema.js";

class Rejected extends Error {
  constructor(public status: number) { super("Rejected synthetic input"); }
}

// Structural checks only, not an image decoder or malware scanner.
function recognizable(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 ||
        bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return false;
    let offset = 2;
    let frame = false;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) return false;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      const length = bytes[offset] * 256 + bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return false;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) frame = length >= 8;
      if (marker === 0xda) return frame && offset + length < bytes.length - 2;
      offset += length;
    }
    return false;
  }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 45 || !signature.every((v, i) => bytes[i] === v)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let header = false;
  let data = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) return false;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!header) {
      if (type !== "IHDR" || length !== 13 || !view.getUint32(offset + 8) || !view.getUint32(offset + 12)) return false;
      header = true;
    } else if (type === "IHDR") return false;
    if (type === "IDAT") data = true;
    offset += length + 12;
    if (type === "IEND") return data && length === 0 && offset === bytes.length;
  }
  return false;
}

export async function probe(request: Request): Promise<Response> {
  const buffers: Uint8Array[] = [];
  const parts: { inlineData: { mimeType: string; data: string } }[] = [];
  try {
    // Bound the actual stream, not the untrusted Content-Length header.
    let received = 0;
    const bounded = request.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > LIMITS.totalBytes + 64 * 1024) throw new Rejected(413);
        controller.enqueue(chunk);
      },
    }));
    const copy = new Request(request.url, {
      method: "POST", headers: request.headers, body: bounded,
      duplex: "half",
    } as RequestInit);
    let form: FormData;
    try { form = await copy.formData(); } catch {
      throw new Rejected(received > LIMITS.totalBytes + 64 * 1024 ? 413 : 400);
    }
    const entries = [...form.entries()];
    if (!entries.length) throw new Rejected(400);
    if (entries.length > LIMITS.files) throw new Rejected(413);
    let total = 0;
    for (const [field, file] of entries) {
      if (field !== "files" || typeof file === "string") throw new Rejected(400);
      if (file.size > LIMITS.fileBytes || (total += file.size) > LIMITS.totalBytes) throw new Rejected(413);
      const extension = file.name.toLowerCase().split(".").at(-1);
      if (!(file.type === "image/png" && extension === "png") &&
          !(file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension ?? ""))) throw new Rejected(415);
      const bytes = new Uint8Array(await file.arrayBuffer());
      buffers.push(bytes);
      if (!recognizable(bytes, file.type)) throw new Rejected(415);
      parts.push({ inlineData: { mimeType: file.type, data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64") } });
    }
    let calls = 0;
    let jsonBytes = 0;
    const client = new GoogleGenAI({
      apiKey: "synthetic-probe-not-a-secret", vertexai: false,
      httpOptions: {
        retryOptions: { attempts: 1 },
        fetch: async (_url, init) => {
          calls++;
          // The SDK must serialize the entire outgoing request. Never log it.
          if (typeof init?.body !== "string") throw new Error("Expected SDK JSON");
          jsonBytes = init.body.length; // ASCII synthetic request: chars = bytes.
          return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(mockAnalysis()) }] }, finishReason: "STOP" }] });
        },
      },
    });
    const result = await client.models.generateContent({
      model: "gemini-3.1-flash-lite", contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json", responseJsonSchema: geminiResponseSchema, maxOutputTokens: 6000 },
    });
    const analysis = validateAnalysis(JSON.parse(result.text!));
    return Response.json({ analysis, simulated: true, metrics: { total, received, jsonBytes, calls, base64Chars: parts.reduce((n, part) => n + part.inlineData.data.length, 0) } });
  } catch (error) {
    return Response.json({ error: "PROBE_REJECTED" }, { status: error instanceof Rejected ? error.status : 500 });
  } finally {
    for (const bytes of buffers) bytes.fill(0);
    for (const part of parts) part.inlineData.data = "";
  }
}

export default { fetch: probe };
