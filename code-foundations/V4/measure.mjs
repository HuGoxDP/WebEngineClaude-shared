// V4: real-GPU memory of the solar-system scenario streamed at a capped texture level.
//   node measure.mjs <gpu: high|low> <level: 0|1|full|base> [waitMs]
// Engine estimate from MemoryProfiler.snapshot(); real memory from the Windows counters
// "\GPU Process Memory(pid_<edge gpu-process>_luid_*)\{Dedicated,Shared} Usage".
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
const R = "C:/Users/HuGox/WebstormProjects/WebEngine";
const require = createRequire(path.join(R, "virtual-lab/e2e/package.json"));
const { chromium } = require("playwright");
const [gpu, level, waitArg] = process.argv.slice(2); const waitMs = Number(waitArg ?? 20000);
const ENGINE = path.join(R, ".workers/C/WebEngineTS/dist/WebEngineTS.standalone.js");
const STORE = path.join(R, ".workers/C/ScenarioCreator/ReleaseScenarios");
const pref = gpu === "low" ? "low-power" : "high-performance";
const page = `<!doctype html><html><head><script type="importmap">{"imports":{"WebEngineTS":"/engine.js"}}</script>
<style>html,body{margin:0;background:#000}canvas{display:block;width:1280px;height:800px}</style></head><body><canvas id="c" width="1280" height="800"></canvas>
<script type="module">
import * as E from "/engine.js"; window.E = E;
E.Application.powerPreference = "${pref}";
const app = new E.Application(document.getElementById("c")); window.app = app;
const L = ${JSON.stringify(level)};
const fetchCapped = async (url) => {
  const r = await fetch(url);
  if (!url.endsWith(".scenario.json") || L === "full") return r;
  const m = await r.json(); const cap = Number(L);
  for (const a of m.assets ?? []) if (a.lods && a.lods.length > 1) a.lods = a.lods.filter(l => l.level <= cap);
  return new Response(JSON.stringify(m), { headers: { "content-type": "application/json" } });
};
try {
  if (L !== "base") await app.loadScenarioFromManifest(new URL("/m/solar-system-scenario.scenario.json", location.href).href, undefined, { fetch: fetchCapped });
  window.__ready = "ok";
} catch (e) { window.__ready = "error: " + (e && e.stack || e); }
</script></body></html>`;
const MIME = { ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2" };
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(page); }
  if (u === "/engine.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(readFileSync(ENGINE)); }
  if (u.startsWith("/m/")) { const f = path.join(STORE, u.slice(3)); if (f.startsWith(STORE) && existsSync(f)) { res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" }); return res.end(readFileSync(f)); } }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const udd = mkdtempSync(path.join(tmpdir(), "v4-edge-"));
const ctx = await chromium.launchPersistentContext(udd, { channel: "msedge", headless: true, viewport: { width: 1280, height: 800 },
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu", gpu === "low" ? "--force_low_power_gpu" : "--force_high_performance_gpu"] });
const p = ctx.pages()[0] ?? await ctx.newPage();
await p.goto(`http://127.0.0.1:${server.address().port}/`);
await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
const ready = await p.evaluate(() => window.__ready); if (ready !== "ok") { console.log(ready); process.exit(1); }
await p.waitForTimeout(waitMs);
const eng = await p.evaluate(() => {
  const s = E.MemoryProfiler.snapshot(); const r = s.renderer;
  const tex = E.EngineObject.FindObjectsOfType(E.Texture, true).map(t => `${t.name || "?"} ${t.width}x${t.height}`).sort();
  return { gpu: s.gpu, textures: r.textures, liveTextures: r.liveTextures, texMB: +(r.estimatedTextureVramBytes / 1048576).toFixed(1), geoMB: +(r.estimatedGeometryVramBytes / 1048576).toFixed(1), rtMB: +(r.estimatedRenderTargetVramBytes / 1048576).toFixed(1), formats: r.textureFormats, tex };
});
const ps = (cmd) => execFileSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
const pidLine = 'via gpumem.ps1';
const samples = [];
for (let i = 0; i < 3; i++) {
  const txt = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), 'gpumem.ps1'), '-NodePid', String(process.pid)], { encoding: 'utf8' });
  const per = {};
  for (const l of txt.split(String.fromCharCode(10)).map(x => x.trim()).filter(Boolean)) { const [pid, luid, kind, v] = l.split('|'); per[luid] ??= { dedicatedMB: 0, sharedMB: 0, pids: [] }; per[luid][kind + 'MB'] += Number(v) / 1048576; if (!per[luid].pids.includes(+pid)) per[luid].pids.push(+pid); }
  samples.push(per); await p.waitForTimeout(2000);
}
const last = samples[samples.length - 1]; for (const k of Object.keys(last)) { last[k].dedicatedMB = +last[k].dedicatedMB.toFixed(1); last[k].sharedMB = +last[k].sharedMB.toFixed(1); }
console.log(JSON.stringify({ gpuArg: gpu, level, gpuPid: pidLine, engine: { ...eng, tex: eng.tex.length + " objects" }, windows: last, texList: eng.tex }, null, 0));
await ctx.close(); server.close();
