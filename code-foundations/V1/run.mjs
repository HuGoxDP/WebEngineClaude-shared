// Scratch harness (Claude, V1/V4): serve the engine + a release ZIP, load it in Edge, run probe code.
//   node run.mjs <zip> <probe.js> [--gpu] [--shots dir] [--wait ms]
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const R = "C:/Users/HuGox/WebstormProjects/WebEngine";
const require = createRequire(path.join(R, "virtual-lab/e2e/package.json"));
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : (args[i + 1] ?? true); };
const zip = args[0], probe = readFileSync(args[1], "utf8");
const engine = flag("--engine", path.join(R, "WebEngineTS/dist/WebEngineTS.standalone.js"));
const W = Number(flag("--w", 1280)), H = Number(flag("--h", 800));
const page = `<!doctype html><html><head><script type="importmap">{"imports":{"WebEngineTS":"/engine.js"}}</script><style>html,body{margin:0;background:#000}canvas{display:block;width:${W}px;height:${H}px}</style></head><body>
<canvas id="c" width="${W}" height="${H}"></canvas>
<script type="module">
import * as E from "/engine.js"; window.E = E;
const app = new E.Application(document.getElementById("c")); window.app = app;
try { const buf = await (await fetch("/s.zip")).arrayBuffer(); window.scenario = await app.loadScenarioFromBuffer(buf); window.__ready = "ok"; }
catch (e) { window.__ready = "error: " + (e && e.stack || e); }
</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(page); }
  if (req.url === "/engine.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(readFileSync(engine)); }
  if (req.url === "/s.zip") { res.writeHead(200, { "content-type": "application/zip" }); return res.end(readFileSync(zip)); }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const gpu = args.includes("--gpu");
const browser = await chromium.launch({ channel: "msedge", headless: true,
  args: gpu ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-unsafe-webgpu"]
            : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(flag("--scale", 1)) });
const p = await ctx.newPage();
const logs = []; p.on("console", m => logs.push(`[${m.type()}] ${m.text()}`)); p.on("pageerror", e => logs.push(`[pageerror] ${e}`));
await p.goto(`http://127.0.0.1:${server.address().port}/`);
await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const ready = await p.evaluate(() => window.__ready);
if (ready !== "ok") { console.log(ready); console.log(logs.join("\n")); process.exit(1); }
await p.waitForTimeout(Number(flag("--wait", 3000)));
const fn = new Function("page", "shot", `return (async () => { ${probe} })();`);
const shotDir = flag("--shots", null);
const shot = async (name, clip) => shotDir && p.screenshot({ path: path.join(shotDir, name), clip });
const out = await fn(p, shot);
console.log(JSON.stringify(out, null, 1));
if (args.includes("--logs")) console.log(logs.slice(-30).join("\n"));
await browser.close(); server.close();
