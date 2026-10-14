import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, quiet, GameObject, AssetDatabase, Prefab, SceneManager } from "../vzw/zz_probe_common";
import { Serializable, SerializedField, getAllFields } from "../../src/engine/core/reflection/Decorators";
import { FieldType } from "../../src/engine/core/reflection/Types";
import { Behaviour } from "../../src/engine/core/Behaviour";
import { Component } from "../../src/engine/core/Component";
import { log } from "./log";

@Serializable({ typeName: "RvS.Box" })
class SBox { @SerializedField({ type: FieldType.GameObject }) public go: GameObject | null = null; }
@Serializable({ typeName: "RvS.Multi" })
class Multi extends Behaviour {
    @SerializedField({ type: FieldType.Array, elementType: FieldType.GameObject }) public gos: (GameObject | null)[] = [];
    @SerializedField({ type: FieldType.Array, elementType: FieldType.Component }) public comps: (object | null)[] = [];
    @SerializedField({ type: FieldType.Object }) public box: unknown = null;
}

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

const depthOf = (address: string | undefined) => (address ?? "").split("/").length - 1;
/** Every reference in a prefab file whose scope counts out further than the link depth it sits at. */
function leaks(file: any): string[] {
    const out: string[] = [];
    const value = (v: any, d: number, where: string) => {
        if (v === null || typeof v !== "object") return;
        if ((v.$type === "GameObjectRef" || v.$type === "ComponentRef") && typeof v.scope === "number" && v.scope > d) out.push(`${where} scope=${v.scope} depth=${d}`);
        for (const k of Object.keys(v)) value(v[k], d, `${where}.${k}`);
    };
    const changes = (c: any, d: number, where: string) => {
        if (!c) return;
        for (const o of c.overrides ?? []) {
            const at = d + depthOf(o.node);
            if (o.component === null && o.field === "prefab") link(o.value, at, `${where}.ov(${o.node}).prefab`);
            else value(o.value, at, `${where}.ov(${o.node}).${o.field}`);
        }
        for (const a of c.addedChildren ?? []) node(a.node, d + depthOf(a.parent), `${where}.add(${a.node.name})`);
        for (const a of c.addedComponents ?? []) value(a.component.fields, d + depthOf(a.node), `${where}.addc(${a.component.type})`);
    };
    const link = (l: any, d: number, where: string) => { if (l && typeof l === "object") { changes(l.changes, d + 1, `${where}~`); changes(l.unused, d + 1, `${where}~u`); } };
    const node = (n: any, d: number, where: string) => {
        if (!n) return;
        for (const c of n.components ?? []) value(c.fields, d, `${where}/${n.name}.${c.type}`);
        for (const ch of n.children ?? []) node(ch, d, `${where}/${n.name}`);
        if (n.prefab) link(n.prefab, d, `${where}/${n.name}`);
    };
    if (file.snapshot) node(file.snapshot, 0, "");
    if (file.changes) changes(file.changes, 0, "variant");
    return out;
}
/** Instantiates `p` next to decoys and returns every live reference that points outside the instance. */
function liveLeaks(p: Prefab): string[] {
    clear();
    const decoy = obj("Decoy", "decoy", obj("D1", "d1"));
    decoy.addComponent(Aim);
    const inst = p.instantiate();
    const inside = (g: GameObject) => { for (let a: GameObject | null = g; a; a = a.transform.parent?.gameObject ?? null) if (a === inst) return true; return false; };
    const out: string[] = [];
    const check = (v: any, where: string) => {
        if (v === null || v === undefined) return;
        if (Array.isArray(v)) return v.forEach((x, i) => check(x, `${where}[${i}]`));
        if (v instanceof GameObject) { if (!inside(v)) out.push(`${where} -> ${v.name}`); return; }
        if (v instanceof Component) { if (!inside(v.gameObject)) out.push(`${where} -> ${v.gameObject.name}.${v.constructor.name}`); return; }
        if (v instanceof SBox) check(v.go, `${where}.go`);
    };
    const walk = (g: GameObject) => {
        for (const c of (g as any)._components as object[]) {
            for (const f of getAllFields((c as any).constructor)) if (f.serialize) check((c as any)[f.name], `${g.name}.${(c as any).constructor.name}.${f.name}`);
        }
        for (let i = 0; i < g.transform.childCount; i++) walk(child(g, i));
    };
    walk(inst);
    return out;
}
function verdict(p: Prefab, label: string) {
    const file = JSON.parse(JSON.stringify(p.toJSON()));
    const l = leaks(file);
    const w = quiet();
    const ll = liveLeaks(p);
    const calls = w.calls();
    w.restore();
    log("scope", label, { leaks: l, liveLeaks: ll, warns: calls });
    return { leaks: l, live: ll, file };
}
const sight = (parent: GameObject, aimAt: GameObject | null, extra?: (g: GameObject) => void) => {
    const s = new GameObject("Sight"); s.transform.setParent(parent.transform, false);
    const dot = new GameObject("Dot"); dot.transform.setParent(s.transform, false);
    dot.addComponent(Aim).target = aimAt;
    extra?.(dot);
    return s;
};

describe("applyInstance: nothing counting out of the prefab reaches its file", () => {
    test("C1 top-level: changed value pointing out keeps the prefab's own value (JSDoc)", () => {
        const { turret } = world();
        const i = turret.instantiate();
        const watcher = new GameObject("Watcher");
        i.getComponent(Aim)!.target = watcher;
        turret.applyInstance(i);
        const v = verdict(turret, "C1");
        expect(v.leaks).toEqual([]); expect(v.live).toEqual([]);
        const fresh = turret.instantiate();
        expect(fresh.getComponent(Aim)!.target).toBe(child(fresh, 0));
    });
    test("C2/C3 top-level: added component and added grandchild pointing out are null; arrays and structs too", () => {
        const { turret } = world();
        const i = turret.instantiate();
        const watcher = obj("Watcher", "w");
        i.addComponent(Pick).comp = watcher.getComponent(Tag);
        sight(i, watcher, dot => { const m = dot.addComponent(Multi); m.gos = [watcher, child(i, 0)]; m.comps = [watcher.getComponent(Tag), i.getComponent(Tag)]; const b = new SBox(); b.go = watcher; m.box = b; });
        turret.applyInstance(i);
        const v = verdict(turret, "C2C3");
        expect(v.leaks).toEqual([]); expect(v.live).toEqual([]);
        const fresh = turret.instantiate();
        const m = child(fresh, 1, 0).getComponent(Multi)!;
        expect(m.gos[0]).toBeNull(); expect(m.gos[1]).toBe(child(fresh, 0));
        expect(m.comps[1]).toBe(fresh.getComponent(Tag));
    });
    test("C4 top-level: an override inside the nested Barrel pointing out is dropped", () => {
        const { turret, barrel } = world();
        const i = turret.instantiate();
        child(i, 0).getComponent(Aim)!.target = new GameObject("Watcher");
        turret.applyInstance(i);
        const v = verdict(turret, "C4");
        expect(v.leaks).toEqual([]); expect(v.live).toEqual([]);
    });
    test("C5-C8 nested TurretL: overrides, added grandchildren, nested-nested overrides/children pointing at Tank/Hull/TurretR", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        const L = child(t, 1);
        L.getComponent(Aim)!.target = child(t, 0);                     // C5 override -> Hull
        sight(L, child(t, 0), dot => { const m = dot.addComponent(Multi); m.gos = [child(t, 0), child(L, 0), child(t, 2)]; const b = new SBox(); b.go = t; m.box = b; }); // C6
        child(L, 0).getComponent(Aim)!.target = child(t, 2);          // C7 nested-nested override -> TurretR
        sight(child(L, 0), t);                                         // C8 added under nested Barrel -> Tank
        child(L, 0).addComponent(Pick).comp = child(t, 2, 0).getComponent(Tag); // added comp in nested-nested -> TurretR barrel
        turret.applyInstance(L);
        const v = verdict(turret, "C5-C8");
        expect(v.leaks).toEqual([]); expect(v.live).toEqual([]);
        clear();
        const untouched = turret.instantiate();
        expect(turret.getChanges(untouched)).toEqual({ overrides: [] });
    });
    test("C9 nested: an added child that is itself a Barrel instance, its overrides pointing at Hull (out) and at the Turret root (in)", () => {
        const { tank, turret, barrel } = world();
        const t = tank.instantiate();
        const L = child(t, 1);
        const extra = barrel.instantiate();
        extra.name = "Extra";
        extra.transform.setParent(L.transform, false);
        extra.getComponent(Aim)!.target = child(t, 0);
        extra.addComponent(Pick).comp = L.getComponent(Tag);
        const extra2 = barrel.instantiate();
        extra2.name = "Extra2";
        extra2.transform.setParent(L.transform, false);
        extra2.getComponent(Aim)!.target = L;
        turret.applyInstance(L);
        const v = verdict(turret, "C9");
        expect(v.leaks).toEqual([]); expect(v.live).toEqual([]);
        const fresh = turret.instantiate();
        const e2 = Array.from({ length: fresh.transform.childCount }, (_, k) => child(fresh, k)).find(g => g.name === "Extra2")!;
        expect(e2.getComponent(Aim)!.target).toBe(fresh);
        const e1 = Array.from({ length: fresh.transform.childCount }, (_, k) => child(fresh, k)).find(g => g.name === "Extra")!;
        expect(e1.getComponent(Pick)!.comp).toBe(fresh.getComponent(Tag));
    });
    test("C11 variant: added component pointing out is null in the variant's changes", () => {
        const { turret } = world();
        const v0 = Prefab.createVariant(turret, []);
        AssetDatabase._bindGuid("guid-var", v0);
        const i = v0.instantiate();
        const watcher = new GameObject("Watcher");
        i.addComponent(Pick).comp = watcher.getComponent(GameObject as any) ?? watcher.transform;
        sight(i, watcher);
        i.getComponent(Aim)!.target = watcher;
        v0.applyInstance(i);
        const v = verdict(v0, "C11");
        expect(v.leaks).toEqual([]); expect(v.live).toEqual([]);
        const fresh = v0.instantiate();
        expect(fresh.getComponent(Aim)!.target).toBe(child(fresh, 0));
    });
    test("C12 depth 2: Base > Tank > TurretL; tank.applyInstance(base's Tank) keeps Hull refs, nulls Base refs", () => {
        const { tank } = world();
        const base = prefabFrom(() => obj("Base", "base", obj("Wall", "wall"), tank.instantiate()), "guid-base");
        const b = base.instantiate();
        const T = child(b, 1);
        const L = child(T, 1);
        sight(L, child(T, 0), dot => { const m = dot.addComponent(Multi); m.gos = [child(b, 0), child(T, 0), b]; });
        child(L, 0).getComponent(Aim)!.target = child(b, 0);     // nested-nested override -> Wall (out of Tank)
        L.getComponent(Aim)!.target = child(T, 0);               // TurretL override -> Hull (inside Tank)
        tank.applyInstance(T);
        const v = verdict(tank, "C12");
        expect(v.leaks).toEqual([]); expect(v.live).toEqual([]);
        const fresh = tank.instantiate();
        expect(child(fresh, 1).getComponent(Aim)!.target).toBe(child(fresh, 0));
        const dot = child(fresh, 1, 1, 0);
        expect(dot.getComponent(Aim)!.target).toBe(child(fresh, 0));
        expect(dot.getComponent(Multi)!.gos).toEqual([null, child(fresh, 0), null]);
    });
    test("C14 depth 2 with a reordered (fully held) nested instance inside the applied one", () => {
        const turret = prefabFrom(() => { const t = obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")); t.addComponent(Aim); return t; }, "guid-turret");
        const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
        const base = prefabFrom(() => obj("Base", "base", obj("Wall", "wall"), tank.instantiate()), "guid-base");
        const b = base.instantiate();
        const T = child(b, 1);
        child(T, 1, 1).transform.setSiblingIndex(0);
        child(T, 1).getComponent(Aim)!.target = child(b, 0);   // -> Wall, out of Tank
        const w = quiet();
        tank.applyInstance(T);
        w.restore();
        const v = verdict(tank, "C14");
        expect(v.leaks).toEqual([]); expect(v.live).toEqual([]);
    });
});
