import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { probe } from "./flow.js";

const MiB = 1024 * 1024;
function crc(bytes: Buffer) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc(result.subarray(4, -4)), result.length - 4);
  return result;
}
function png(size?: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  const pieces = [Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0,100,150,200])))];
  const end = chunk("IEND", Buffer.alloc(0));
  const current = pieces.reduce((n, p) => n + p.length, end.length);
  if (size) pieces.push(chunk("tEXt", Buffer.concat([Buffer.from("padding\0"), Buffer.alloc(size - current - 20, 65)])));
  return Buffer.concat([...pieces, end]);
}
// A synthetic baseline JPEG; no user documents are read.
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAr/2Q==", "base64");
type Input = { bytes: Buffer; mime: string; name: string };
const image = (size?: number): Input => ({ bytes: png(size), mime: "image/png", name: "synthetic.png" });
const small = image();
const cases: { name: string; files: Input[]; status: number }[] = [
  { name: "small PNG", files: [small], status: 200 },
  { name: "valid JPG", files: [{ bytes: jpeg, mime: "image/jpeg", name: "synthetic.jpg" }], status: 200 },
  { name: "six PNG", files: Array(6).fill(small), status: 200 },
  { name: "4 MiB", files: [image(4 * MiB)], status: 200 },
  { name: "10 MiB six files", files: [image(4 * MiB), image(2 * MiB), ...Array.from({ length: 4 }, () => image(MiB))], status: 200 },
  { name: "forged MIME", files: [{ ...small, mime: "image/jpeg", name: "synthetic.jpg" }], status: 415 },
  { name: "corrupt PNG", files: [{ ...small, bytes: small.bytes.subarray(0, -8) }], status: 415 },
  { name: "PDF", files: [{ bytes: Buffer.from("%PDF-1.7\n"), mime: "application/pdf", name: "synthetic.pdf" }], status: 415 },
  { name: "file over limit", files: [image(4 * MiB + 1)], status: 413 },
  { name: "total over limit", files: [image(4 * MiB), image(4 * MiB), image(2 * MiB + 1)], status: 413 },
  { name: "seven files", files: Array(7).fill(small), status: 413 },
];
function request(files: Input[]) {
  const form = new FormData();
  for (const file of files) form.append("files", new Blob([new Uint8Array(file.bytes)] , { type: file.mime }), file.name);
  return new Request("http://probe.invalid/api/analyze", { method: "POST", body: form });
}

const bundled = await build({ entryPoints: ["probe/flow.ts"], bundle: true, write: false, format: "esm", platform: "browser", external: ["node:buffer"], logLevel: "silent" });
const mf = new Miniflare({ ...convertV4MiniflareOptions({ name: "probe", modules: true, script: bundled.outputFiles[0].text, compatibilityDate: "2026-09-22", compatibilityFlags: ["nodejs_compat"], cf: false, inspectorPort: 0 }), telemetry: { enabled: false } });
try {
  for (const entry of cases) {
    const req = request(entry.files);
    const response = await mf.dispatchFetch(req.url, { method: "POST", headers: Object.fromEntries(req.headers), body: await req.arrayBuffer() });
    assert.equal(response.status, entry.status, entry.name);
    const data = await response.json() as { metrics?: Record<string, number> };
    if (entry.status === 200) assert.equal(data.metrics?.calls, 1);
    console.log(JSON.stringify({ runtime: "workerd-local", case: entry.name, status: response.status, ...data.metrics }));
  }
  const inspector = await mf.getInspectorURL();
  const listUrl = new URL("/json/list", inspector);
  listUrl.protocol = "http:";
  const targets = await (await fetch(listUrl)).json() as { id: string; title: string; webSocketDebuggerUrl: string }[];
  const target = targets.find(t => t.title.includes("probe"));
  assert.ok(target, JSON.stringify(targets.map(t => ({ id: t.id, title: t.title }))));
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = () => reject(new Error("Local inspector failed")); });
  let serial = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error("Local inspector command failed"));
    else callback.resolve(message.result);
  };
  const command = (method: string, params = {}) => new Promise<unknown>((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  try {
    await command("Profiler.enable");
    await command("Profiler.setSamplingInterval", { interval: 1000 });
    const runtimeMetrics = () => {
      if (process.platform !== "win32") return undefined;
      // Test host only. No child processes are used by the Worker itself.
      const values = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", "@(Get-Process -Name workerd -ErrorAction Stop | Select-Object Id,CPU,WorkingSet64) | ConvertTo-Json -Compress"], { encoding: "utf8", windowsHide: true }));
      const rows = Array.isArray(values) ? values : [values];
      // Never attribute another workerd instance's consumption to this probe.
      return rows.length === 1 ? rows[0] as { Id: number; CPU: number; WorkingSet64: number } : undefined;
    };
    for (let i = 0; i < 5; i++) {
      const req = request(cases[4].files);
      const body = await req.arrayBuffer();
      const before = runtimeMetrics();
      await command("Profiler.start");
      const response = await mf.dispatchFetch(req.url, { method: "POST", headers: Object.fromEntries(req.headers), body });
      await response.arrayBuffer();
      const { profile } = await command("Profiler.stop") as { profile: { nodes: { id: number; callFrame: { functionName: string } }[]; samples: number[]; timeDeltas: number[] } };
      const names = new Map(profile.nodes.map(n => [n.id, n.callFrame.functionName]));
      const after = runtimeMetrics();
      let active = 0;
      const functions = new Map<string, number>();
      profile.samples.forEach((id, index) => {
        const name = names.get(id) ?? "unknown";
        const time = profile.timeDeltas[index] / 1000;
        if (!["(idle)", "(program)", "(root)"].includes(name)) {
          active += time;
          functions.set(name, (functions.get(name) ?? 0) + time);
        }
      });
      console.log(JSON.stringify({ runtime: "workerd-local-CDP", case: "10 MiB six files", sampledActiveMs: +active.toFixed(2), runtimeProcessCpuMs: before && after && before.Id === after.Id ? +((after.CPU - before.CPU) * 1000).toFixed(2) : null, runtimeProcessRssMiB: after ? +(after.WorkingSet64 / MiB).toFixed(2) : null, topFunctions: [...functions].sort((a,b) => b[1]-a[1]).slice(0, 6), note: "sampling excludes idle/program/root; process CPU/RSS include runtime and inspector, not per-isolate billing" }));
    }
  } finally { socket.close(); }
} finally { await mf.dispose(); }

// Separate Node Web API baseline: includes server-side parsing, validation,
// base64, SDK JSON serialization and response. Excludes fixture/client creation.
// process.cpuUsage measures THIS Node process, not Cloudflare CPU billing.
for (const entry of cases.filter(c => c.status === 200)) {
  const samples: number[] = [];
  let maxMemoryDelta = 0;
  for (let i = 0; i < 6; i++) {
    const req = request(entry.files);
    const serialized = await req.arrayBuffer();
    const received = new Request(req.url, { method: "POST", headers: req.headers, body: serialized });
    const memory = process.memoryUsage();
    const start = process.cpuUsage();
    const response = await probe(received);
    await response.arrayBuffer();
    const cpu = process.cpuUsage(start);
    const after = process.memoryUsage();
    assert.equal(response.status, 200);
    if (i) samples.push((cpu.user + cpu.system) / 1000);
    maxMemoryDelta = Math.max(maxMemoryDelta, after.rss - memory.rss);
  }
  samples.sort((a,b) => a-b);
  console.log(JSON.stringify({ runtime: "Node-Web-API-baseline", case: entry.name, cpuMs: samples, medianCpuMs: samples[2], maxObservedRssDeltaMiB: +(maxMemoryDelta / MiB).toFixed(2), note: "not workerd CPU; RSS sampled at boundaries, not peak" }));
}
