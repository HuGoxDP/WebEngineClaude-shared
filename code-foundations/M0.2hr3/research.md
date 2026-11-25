# M0.2hr3 research — deferred MeshRenderer geometry rebuild
Status: confirmed (autonomous). Date 2026-11-25. Base: origin/ms/1.

Problem: every Mesh data write -> Mesh._markDirty -> _notifyObservers -> MeshRenderer._onMeshEdited -> _syncGeometry,
which reads mesh._internalGeometry (graphics/Mesh.ts:170) and so runs Mesh._syncToThree each write. 5 writes = 5 rebuilds.

Facts (read on origin/ms/1):
- rendering/MeshRenderer.ts: _syncGeometry (l.203), _onMeshEdited arrow (l.235), onDestroy removes observer (l.108).
- graphics/Mesh.ts: _markDirty (l.262) sets _needsUpdate then notifies; _notifyObservers is also used for bounds-only changes (U-4 immediate path).
- core/Application.ts: Transform._syncAllDirty() at l.1088 (_render) and l.1166 (warmupShaders). Serial file: M0.2hr3 -> C6r3.
- Existing tests: tests/MeshFilterMesh.test.ts, others assume immediate sync (U-4) and must stay unmodified.

Key tension: U-4 keeps existing immediate-sync tests green. Existing tests read renderer state right after a write, with no flush.
Decision: split notification. _markDirty keeps the Mesh-level observer call but MeshRenderer's observer becomes: if the write is a data write -> add to static dirty set; bounds-only notifications stay immediate.
But existing tests that read renderer.bounds/geometry after a data write without a flush would see stale values. Mitigation: the renderer's own readers (bounds, geometry pull) call _flushSelf() lazily when the renderer is in the dirty set (pull on access), so tests see the same values; the 5-rebuild case collapses because no one reads between writes.
Rejected: changing Mesh._markDirty semantics for all observers (wider blast radius); flushing only in Application (breaks U-4).
Open risk: any renderer reader not covered by the self-flush. Phase 1 must enumerate readers of _threeMesh.geometry/_localBounds.
