import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, reload, quiet, GameObject, AssetDatabase, Prefab } from "../vzw/zz_probe_common";
import { log } from "./log";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

describe("revertOverride of a removed component: bookkeeping", () => {
    test("scene removed Tag 'barrel' and added a Tag 'extra': a watcher on the removed one", () => {
        const { barrel } = world();
        const i = barrel.instantiate();
        const tags = i.getComponents(Tag);
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Pick).comp = tags[0];
        i.removeComponent(tags[0]);
        i.addComponent(Tag).label = "extra";
        const ch = barrel.getChanges(i);
        log("edge", "changes", { removed: ch.removedComponents, added: ch.addedComponents?.map((a: any) => a.component.fields.label) });
        const w = quiet();
        barrel.revertOverride(i, ch.removedComponents![0]);
        const calls = w.calls();
        w.restore();
        log("edge", "warns", calls);
        const held = watcher.getComponent(Pick)!.comp as any;
        log("edge", "held", held === null ? null : { exists: held.exists(), label: held.label });
        // Either re-pointed at the restored 'barrel' Tag, or null — never a destroyed component.
        expect(held === null || held.exists()).toBe(true);
    });
    test("a watcher on a scene-added Tag the scene then deleted is not re-pointed at the restored prefab Tag", () => {
        const { barrel } = world();
        const i = barrel.instantiate();
        const tags = i.getComponents(Tag);
        i.removeComponent(tags[0]);
        const extra = i.addComponent(Tag); extra.label = "extra";
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Pick).comp = extra;
        i.removeComponent(extra);
        const ch = barrel.getChanges(i);
        const w = quiet();
        barrel.revertOverride(i, ch.removedComponents![0]);
        w.restore();
        const held = watcher.getComponent(Pick)!.comp as any;
        log("edge", "deleted-extra held", held === null ? null : { exists: held.exists(), label: held.label });
        expect(held === null || held.label !== "barrel").toBe(true);
    });
});

describe("revert of a nested instance brings back a child the scene removed: references follow", () => {
    test("watcher on TurretL's Barrel, Barrel removed, then turret.revert(TurretL)", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Aim).target = child(t, 1, 0);
        child(t, 1, 0).destroyImmediate();
        turret.revert(child(t, 1));
        expect(watcher.getComponent(Aim)!.target).toBe(child(t, 1, 0));
    });
    test("explicit null on a watcher survives revertOverride of a removed child", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Aim).target = child(t, 1, 0);
        watcher.getComponent(Aim)!.target = null;
        child(t, 1, 0).destroyImmediate();
        tank.revertOverride(t, tank.getChanges(t).removedChildren![0]);
        expect(watcher.getComponent(Aim)!.target).toBeNull();
    });
});

describe("applyInstance through a whole-link override", () => {
    test("Base > Tank > TurretL with Turret prefab unloaded at apply time", () => {
        const { tank, turret } = world();
        const base = prefabFrom(() => obj("Base", "base", obj("Wall", "wall"), tank.instantiate()), "guid-base");
        const b = base.instantiate();
        const T = child(b, 1), L = child(T, 1);
        L.getComponent(Aim)!.target = child(b, 0);       // out of Tank
        const s = new GameObject("Sight"); s.transform.setParent(L.transform, false);
        s.addComponent(Aim).target = child(b, 0);       // out of Tank
        AssetDatabase._unbind(turret);
        const w = quiet();
        let err: unknown = null;
        try { tank.applyInstance(T); } catch (e) { err = e; }
        w.restore();
        const file = JSON.stringify(tank.toJSON());
        log("edge", "whole-link apply err", String(err), "has prefab-field override", file.includes('"field":"prefab"'), "scopes", file.match(/"scope":\d+/g));
        expect(file.match(/"scope":[2-9]/g)).toBeNull();
    });
});
