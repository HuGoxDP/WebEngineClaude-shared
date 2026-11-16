const r = await page.evaluate(async () => {
  const { GameObject, Vector3, Quaternion, Mesh, MeshFilter, MeshRenderer, StandardMaterial, Color, DirectionalLight, LightShadows, SpriteRenderer, Texture2D, Camera, CinemachineBrain } = E;
  const cam = Camera.main;
  for (const g of E.SceneManager.activeScene.getRootGameObjects()) if (g !== cam.gameObject) g.setActive(false);
  const brain = cam.gameObject.getComponent(CinemachineBrain); if (brain) brain.enabled = false;
  cam.transform.position = new Vector3(0, 7, -9); cam.transform.lookAt(new Vector3(0, 0, 0));
  const solid = (name, mesh, pos, col) => { const g = new GameObject(name); g.addComponent(MeshFilter).sharedMesh = mesh; const mr = g.addComponent(MeshRenderer); const m = new StandardMaterial(); m.color = col; mr.sharedMaterial = m; mr.receiveShadows = true; g.transform.position = pos; return g; };
  solid("Floor", Mesh.createPlane(30, 30), new Vector3(0, 0, 0), new Color(0.9, 0.9, 0.9, 1));
  solid("Cube", Mesh.createCube(2), new Vector3(0, 1, 0), new Color(0.8, 0.5, 0.2, 1));
  const lg = new GameObject("Sun Light"); const L = lg.addComponent(DirectionalLight); L.shadows = LightShadows.Hard; L.intensity = 1.5;
  lg.transform.rotation = Quaternion.euler(30, 60, 0);
  const f = lg.transform.forward;
  // a 64×64 sprite: left half red, right half blue, top quarter green — texel (0,0) is Unity's bottom-left
  const tex = new Texture2D(64, 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) tex.setPixel(x, y, y >= 48 ? new Color(0, 1, 0, 1) : x < 32 ? new Color(1, 0, 0, 1) : new Color(0, 0, 1, 1)); tex.apply();
  const sg = new GameObject("Sprite"); const sr = sg.addComponent(SpriteRenderer); sr.sprite = tex; sg.transform.position = new Vector3(-5, 3, 2); sg.transform.localScale = new Vector3(3, 3, 3);
  await new Promise(r => setTimeout(r, 7000));
  const blob = await app.captureFrame({ maxWidth: 1280 });
  const bmp = await createImageBitmap(blob); const cv = new OffscreenCanvas(bmp.width, bmp.height); const cx = cv.getContext("2d"); cx.drawImage(bmp, 0, 0);
  const k = bmp.width / cam.pixelWidth;
  const lum = (p) => { const s = cam.worldToScreenPoint(p); const d = cx.getImageData(Math.round(s.x * k) - 3, Math.round(s.y * k) - 3, 7, 7).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += 0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2]; return Math.round(t / (d.length / 4)); };
  const h = new Vector3(f.x, 0, f.z); const n = Math.hypot(h.x, h.z); const ux = h.x / n, uz = h.z / n;
  const at = (dx, dz, d) => new Vector3(dx * d, 0, dz * d);
  const D = 2.6;
  const shadowSide = lum(at(ux, uz, D)), opposite = lum(at(-ux, -uz, D)), left90 = lum(at(-uz, ux, D)), right90 = lum(at(uz, -ux, D));
  // sprite colours: where are red, blue, green on screen?
  const c = cam.worldToScreenPoint(sg.transform.position); const cxp = c.x * k, cyp = c.y * k;
  const img = cx.getImageData(0, 0, bmp.width, bmp.height).data; const cent = { r: [0, 0, 0], g: [0, 0, 0], b: [0, 0, 0] };
  for (let y = Math.max(0, cyp - 200); y < Math.min(bmp.height, cyp + 200); y++) for (let x = Math.max(0, cxp - 200); x < Math.min(bmp.width, cxp + 200); x++) { const i = (Math.floor(y) * bmp.width + Math.floor(x)) * 4; const R = img[i], G = img[i+1], B = img[i+2]; const key = R > 150 && G < 90 && B < 90 ? "r" : G > 150 && R < 90 && B < 90 ? "g" : B > 150 && R < 90 && G < 90 ? "b" : null; if (key) { cent[key][0] += x; cent[key][1] += y; cent[key][2]++; } }
  const cen = Object.fromEntries(Object.entries(cent).map(([q, v]) => [q, v[2] ? [Math.round(v[0] / v[2]), Math.round(v[1] / v[2]), v[2]] : null]));
  return { build: E.BuildInfo.builtAt, lightForward: [f.x, f.y, f.z].map(v => +v.toFixed(3)), luminance: { shadowSide, opposite, left90, right90 }, spriteCentroids_xy_count: cen, spriteScreenCentre: [Math.round(cxp), Math.round(cyp)] };
});
await shot("shared.png");
return r;
