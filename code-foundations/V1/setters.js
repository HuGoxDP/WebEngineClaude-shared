return await page.evaluate(async () => {
  const { GameObject, Vector3, Mesh, MeshFilter, MeshRenderer, StandardMaterial, UnlitMaterial, Color, Camera } = E;
  for (const q of E.SceneManager.activeScene.getRootGameObjects()) if (q !== Camera.main.gameObject && !/Light|Ambient/.test(q.name)) q.setActive(false);
  const cam = Camera.main; const cases = {};
  const mk = (name, x, fn) => { const g = new GameObject(name); fn(g); g.transform.position = new Vector3(x, 0, 0); cases[name] = g; };
  const mat = () => { const m = new UnlitMaterial(); m.color = new Color(1, 0, 1, 1); return m; };
  mk("shared+sharedMat", -6, g => { g.addComponent(MeshFilter).sharedMesh = Mesh.createCube(2); g.addComponent(MeshRenderer).sharedMaterial = mat(); });
  mk("shared+material", -2, g => { g.addComponent(MeshFilter).sharedMesh = Mesh.createCube(2); g.addComponent(MeshRenderer).material = mat(); });
  mk("mesh+sharedMat", 2, g => { g.addComponent(MeshFilter).mesh = Mesh.createCube(2); g.addComponent(MeshRenderer).sharedMaterial = mat(); });
  mk("rendererFirst+shared", 6, g => { const f = g.addComponent(MeshFilter); g.addComponent(MeshRenderer).sharedMaterial = mat(); f.sharedMesh = Mesh.createCube(2); });
  await new Promise(r => setTimeout(r, 4000));
  const blob = await app.captureFrame({ maxWidth: 1280 }); const bmp = await createImageBitmap(blob); const cv = new OffscreenCanvas(bmp.width, bmp.height); const cx = cv.getContext("2d"); cx.drawImage(bmp, 0, 0); const k = bmp.width / cam.pixelWidth;
  const out = {};
  for (const [n, g] of Object.entries(cases)) { const s = cam.worldToScreenPoint(g.transform.position); const d = cx.getImageData(Math.round(s.x * k), Math.round(s.y * k), 1, 1).data; out[n] = (d[0] > 200 && d[2] > 200 && d[1] < 80) ? "DRAWN" : `not drawn rgb(${d[0]},${d[1]},${d[2]})`; }
  return out;
});
