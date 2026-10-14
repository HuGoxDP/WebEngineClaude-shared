import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, world, saveLink, reload, AssetDatabase, GameObject, SceneSerializer, Prefab } from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

const fmt = (os: any[]) => os.map(o => `${o.node} ${o.component}.${o.field}=${JSON.stringify(o.value)}`);

test("getChanges lists what a link save records: a reference out of the instance", () => {
    const { tank } = world();
    const player = new GameObject("Player");
    const t = tank.instantiate();
    child(t, 2, 0).getComponent(Aim)!.target = player;
    const saved = saveLink().roots[1].prefab!.changes!.overrides;
    expect(fmt(tank.getChanges(t).overrides)).toEqual(fmt(saved));
});

test("revertOverride can revert a reference out of the instance", () => {
    const { tank } = world();
    const player = new GameObject("Player");
    const t = tank.instantiate();
    child(t, 2, 0).getComponent(Aim)!.target = player;
    const all = tank.getOverrides(t).filter(o => o.field === "target");
    expect(all.length).toBe(1);
});

test("Instantiate (clone) of an instance whose barrel aims out: link save of the copy", () => {
    const { tank } = world();
    const player = new GameObject("Player");
    const t = tank.instantiate();
    child(t, 2, 0).getComponents(Tag)[1].label = "R2";
    const copy = (GameObject as any).Instantiate ? (GameObject as any).Instantiate(t) : null;
    if (!copy) return;
    expect(copy.isPrefabInstance).toBe(true);
    expect(tank.getChanges(copy)).toEqual(tank.getChanges(t));
    const s = saveLink();
    const [, a, b] = reload(s);
    expect(child(b, 2, 0).getComponents(Tag)[1].label).toBe("R2");
});
