import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, Pick, clear, child, obj, world, saveLink, saveExpand, reload, quiet, rebind, prefabFrom,
    GameObject, SceneSerializer, Prefab, AssetDatabase, SceneManager,
} from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

const blank = (name: string, id: string) => ({
    name, active: true,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
    components: [], children: [], id,
});

describe("probe: minting order consequences", () => {
    test("first save's positional path to an added object breaks when the prefab loses an earlier child", () => {
        const { tank } = world();
        const player = new GameObject("Player");
        const t = tank.instantiate();
        const flag = new GameObject("Flag");
        flag.transform.setParent(t.transform, false);
        player.addComponent(Aim).target = flag;
        const s1 = saveLink(); // first save, never saved before
        rebind("guid-tank", json => { json.snapshot.children.splice(0, 1); }); // Hull removed from the prefab
        const [p2, t2] = reload(s1);
        const names = [0, 1, 2].filter(i => i < t2.transform.childCount).map(i => child(t2, i).name);
        expect(names).toContain("Flag");
        expect(p2.getComponent(Aim)!.target?.name).toBe("Flag");
    });

    test("first save's positional path retargets to a prefab object when the prefab gains a later child", () => {
        const { tank } = world();
        const player = new GameObject("Player");
        const t = tank.instantiate();
        const flag = new GameObject("Flag");
        flag.transform.setParent(t.transform, false);
        // Flag is the 2nd child: an added child between Hull and Turret L.
        flag.transform.setSiblingIndex(1);
        player.addComponent(Aim).target = flag;
        const s1 = saveLink();
        // Prefab now has Antenna between Hull and Turret L.
        rebind("guid-tank", json => { json.snapshot.children.splice(1, 0, blank("Antenna", "antenna1")); });
        const [p2, t2] = reload(s1);
        expect(p2.getComponent(Aim)!.target?.name).toBe("Flag");
    });

    test("inside one prefab: a reference to an object added in a nested instance uses the id that object is written with", () => {
        const { turret } = world();
        const root = new GameObject("Rig");
        const hull = new GameObject("Hull");
        hull.transform.setParent(root.transform, false);
        const inst = turret.instantiate();
        inst.transform.setParent(root.transform, false);
        const scope = new GameObject("Scope");
        scope.transform.setParent(child(inst, 0).transform, false); // under Barrel inside the Turret
        hull.addComponent(Aim).target = scope;

        const snap = Prefab.fromGameObject(root).toJSON().snapshot!;
        const ref = (snap.children[0].components[0].fields as any).target;
        // The Scope's id as the snapshot writes it, inside the nested links' changes.
        const text = JSON.stringify(snap);
        const scopeId = /"name":"Scope"[^}]*?"id":"([^"]+)"/.exec(text)?.[1]
            ?? /"id":"([^"]+)"[^{]*?"name":"Scope"/.exec(text)?.[1];
        expect(ref.path[ref.path.length - 1]).toBe(scopeId);
    });
});

describe("probe: phantom nested scale override", () => {
    test("reverting the phantom scale override restores the prefab's scale", () => {
        const { tank } = world();
        rebind("guid-turret", json => { json.snapshot.transform.scale = { x: 2, y: 2, z: 2 }; });
        const t = tank.instantiate();
        const changes = tank.getChanges(t);
        const scale = changes.overrides.find(o => o.field === "transform.scale");
        expect(scale).toBeDefined();
        tank.revertOverride(t, scale!);
        expect(child(t, 1).transform.localScale.x).toBeCloseTo(2);
    });

    test("a phantom override survives in the file and the nested root ignores it", () => {
        const { tank } = world();
        tank.instantiate();
        const s0 = saveLink();
        rebind("guid-turret", json => { json.snapshot.transform.scale = { x: 2, y: 2, z: 2 }; });
        reload(s0);
        const s1 = saveLink();
        rebind("guid-turret", json => { json.snapshot.transform.scale = { x: 3, y: 3, z: 3 }; });
        const [t] = reload(s1);
        // The "override" says 2, the instance shows 3: the file lists an override with no effect.
        const listed = s1.roots[0].prefab!.changes!.overrides.filter(o => o.field === "transform.scale");
        expect(listed).toEqual([]);
        expect(child(t, 1).transform.localScale.x).toBeCloseTo(3);
    });
});
