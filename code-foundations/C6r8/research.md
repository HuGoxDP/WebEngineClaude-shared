# C6r8 research: Mesh.createQuad winding

**Summary:** `Mesh.createQuad` (src/engine/core/graphics/Mesh.ts L1337 on origin/ms/1) is XY, normals +Z, triangles [0,1,2, 0,2,3]; the engine's mirrored space culls it for a camera at -z, so it is not a usable screen. Draft decision: fix to Unity Quad (normal -Z), do not document.
**Date:** 2026-11-25. **Status:** draft (autonomous; no grill). **Open:** none.

## Findings
- Current: vertices (-hw,-hh,0),(hw,-hh,0),(hw,hh,0),(-hw,hh,0); normals all (0,0,1); UV (0,0),(1,0),(1,1),(0,1); recipe `{kind:"Quad",args:[w,h]}` (rebuilt by `fromPrimitive` L789 from args only, so no serialisation change).
- PrimitiveWinding.test.ts audits `(b-a)x(c-a) . mean stored normal > 0` per triangle and requires in==0, out>0. Current passes (z of cross = +wh with +Z). Fix keeps it green by flipping BOTH normals and index order together; flipping only one makes it fail.
- Geometry for fix: normals (0,0,-1); triangles [0,2,1, 0,3,2] (cross z = -wh, agrees with -Z). Vertices and UV unchanged: UV (0,0) at (-w/2,-h/2), (1,1) at (w/2,h/2) as AC-4 requires.
- Existing tests touching the quad: `tests/RenderTextureFrame.test.ts` L153-165 pins normal `[0,0,1]` and the "has no history of rendering" finding -> will fail; must be updated (one assertion + comment). `MeshRecipeStale` (recipe), `SecondUvSet` (4 verts, uv2), `Serialization` (kind, vertexCount) are unaffected.
- Docs: `.github/docs/Mesh.md` L158/L408 list CreateQuad without orientation; add a note. ENGINE-GAPS G1 closed row mentions the other four primitives; no row for the quad.
- Consumers: anything using `createQuad` or `PrimitiveType.Quad` saw nothing before (culled), so no content can rely on +Z; two-sided materials would flip side only.

## Decision
Fix, not document (matches MS-2 spec C6r8 decision and AC-4). Measured-number impact: CHANGELOG *Changed* required.
