const snap = () => page.evaluate(() => {
  const res = {};
  const walk = (t, d) => { const g = t.gameObject; if (d <= 4 && /^(Sun|Mercury|Venus|Earth|Moon|Mars|Jupiter|Saturn|Uranus|Neptune|Солнце|Сонце)/i.test(g.name)) { t._ensureWorldMatrix(); const m = t._internalObject3D.matrixWorld.elements; const p = t.position; res[g.name + "#" + d] = { three: [m[12], m[13], m[14]], eng: [p.x, p.y, p.z] }; } for (let i = 0; i < t.childCount; i++) walk(t.getChild(i), d + 1); };
  for (const g of E.SceneManager.activeScene.getRootGameObjects()) walk(g.transform, 0);
  return { t: E.Time.time, scale: E.Time.timeScale, res };
});
const a = await snap(); await page.waitForTimeout(2500); const b = await snap();
const sunKey = Object.keys(a.res).find(k => /^(Sun|Сонце)/i.test(k));
const S0 = sunKey ? a.res[sunKey] : { three: [0,0,0], eng: [0,0,0] }, S1 = sunKey ? b.res[sunKey] : S0;
const out = { dt: b.t - a.t, timeScale: a.scale, sun: sunKey, planets: {} };
for (const k of Object.keys(a.res)) {
  if (k === sunKey || !b.res[k]) continue;
  const f = (sp) => { const r = [0,1,2].map(i => a.res[k][sp][i] - S0[sp][i]); const r1 = [0,1,2].map(i => b.res[k][sp][i] - S1[sp][i]); const v = [0,1,2].map(i => r1[i] - r[i]); return r[2]*v[0] - r[0]*v[2]; };
  out.planets[k] = { Ly_three: +f("three").toExponential(2), Ly_engine: +f("eng").toExponential(2) };
}
await shot("solar.png");
return out;
