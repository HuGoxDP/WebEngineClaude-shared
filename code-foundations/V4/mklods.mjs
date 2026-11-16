// Coarser texture levels for one scenario, made in Edge (canvas, high-quality smoothing) instead of
// convert_to_ktx2.sh's PIL LANCZOS: same rule — longest edge = size, never upscaled, same format.
//   node mklods.mjs <scenarioDir> 512,1024
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire("C:/Users/HuGox/WebstormProjects/WebEngine/virtual-lab/e2e/package.json");
const { chromium } = require("playwright");
const [dir, sizesArg] = process.argv.slice(2); const sizes = sizesArg.split(",").map(Number);
const assets = path.join(dir, "assets");
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(jpe?g|png)$/i.test(n)) files.push(p); } };
walk(assets);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
await page.setContent("<html></html>");
for (const f of files) {
  const rel = path.relative(assets, f); const ext = path.extname(f); const mime = /png/i.test(ext) ? "image/png" : "image/jpeg";
  const b64 = readFileSync(f).toString("base64");
  const res = await page.evaluate(async ({ b64, mime, sizes }) => {
    const blob = await (await fetch(`data:${mime};base64,${b64}`)).blob(); const bmp = await createImageBitmap(blob);
    const out = { w: bmp.width, h: bmp.height, levels: {} };
    for (const s of sizes) {
      if (Math.max(bmp.width, bmp.height) <= s) continue;
      const k = s / Math.max(bmp.width, bmp.height); const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const cv = new OffscreenCanvas(w, h); const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high"; cx.drawImage(bmp, 0, 0, w, h);
      const ob = await cv.convertToBlob({ type: mime, quality: 0.92 }); const buf = new Uint8Array(await ob.arrayBuffer());
      let s2 = ""; for (let i = 0; i < buf.length; i += 0x8000) s2 += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      out.levels[s] = { w, h, b64: btoa(s2) };
    }
    return out;
  }, { b64, mime, sizes });
  const outDir = path.join(dir, "lods", path.dirname(rel)); mkdirSync(outDir, { recursive: true });
  const stem = path.basename(rel, ext);
  const made = [];
  for (const [s, v] of Object.entries(res.levels)) { const o = path.join(outDir, `${stem}.${s}${ext}`); writeFileSync(o, Buffer.from(v.b64, "base64")); made.push(`${s}:${v.w}x${v.h}`); }
  console.log(`${rel} ${res.w}x${res.h} -> ${made.join(" ") || "(already small)"}`);
}
await browser.close();
