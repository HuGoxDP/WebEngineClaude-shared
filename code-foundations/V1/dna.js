const r = await page.evaluate(() => {
  const find = (name) => { let hit = null; const walk = t => { if (hit) return; if (t.gameObject.name === name) hit = t.gameObject; for (let i = 0; i < t.childCount; i++) walk(t.getChild(i)); }; for (const g of E.SceneManager.activeScene.getRootGameObjects()) walk(g.transform); return hit; };
  const curve = (go) => {
    go.transform._ensureWorldMatrix();
    const pts = []; let kind = "";
    go.transform._internalObject3D.traverse(o => {
      if (pts.length || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      o.updateMatrixWorld(true);
      const a = o.geometry.attributes.position, m = o.matrixWorld.elements; kind = o.type + " n=" + a.count;
      const w = (i) => { const x = a.getX(i), y = a.getY(i), z = a.getZ(i); return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]]; };
      for (let i = 0; i < a.count; i++) pts.push(w(i));
    });
    return { kind, pts };
  };
  const torsion = (pts, step) => {
    const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
    const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    let pos = 0, neg = 0;
    for (let i = 0; i + 3 * step < pts.length; i += step) {
      const d1 = sub(pts[i+step], pts[i]), d2 = sub(pts[i+2*step], pts[i+step]), d3 = sub(pts[i+3*step], pts[i+2*step]);
      const t = dot(cross(d1, d2), d3); if (t > 1e-12) pos++; else if (t < -1e-12) neg++;
    }
    return { pos, neg };
  };
  const out = { build: E.BuildInfo.version + " " + E.BuildInfo.builtAt };
  for (const n of ["Backbone (coding)", "Backbone (template)"]) {
    const go = find(n); if (!go) { out[n] = "missing"; continue; }
    const lr = go.getComponent(E.LineRenderer);
    const c = curve(go);
    // a ribbon has 2 vertices per point: average pairs into a centre line
    const centre = []; for (let i = 0; i + 1 < c.pts.length; i += 2) centre.push(c.pts[i].map((v, k) => (v + c.pts[i+1][k]) / 2));
    const eng = []; if (lr) for (let i = 0; i < lr.positionCount; i++) { const p = lr.getPosition(i); eng.push([p.x, p.y, p.z]); }
    out[n] = { mesh: c.kind, ribbonCentre: torsion(centre, 1), rawVerts: torsion(c.pts, 2), engineSpace: torsion(eng, 1), engineUseWorld: lr && lr.useWorldSpace,
      firstEngine: eng.slice(0, 2), firstThree: centre.slice(0, 2) };
  }
  const cam = E.Camera.main; cam.transform._ensureWorldMatrix(); const m = cam.transform._internalObject3D.matrixWorld.elements;
  out.cameraThreePos = [m[12], m[13], m[14]]; const cp = cam.transform.position; out.cameraEnginePos = [cp.x, cp.y, cp.z];
  return out;
});
await shot("dna-full.png");
return r;
