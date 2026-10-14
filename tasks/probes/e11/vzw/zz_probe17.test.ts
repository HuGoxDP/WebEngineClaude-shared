import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, saveLink, saveExpand, reload, quiet, rebind, AssetDatabase, GameObject, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

test("an instance added under an instance, with its own nested override, round-trips in link mode", () => {
    const { tank, turret } = world();
    const player = new GameObject("Player");
    const t = tank.instantiate();
    const extra = turret.instantiate();
    extra.transform.setParent(t.transform, false);
    child(extra, 0).getComponents(Tag)[1].label = "EXTRA";
    child(extra, 0).getComponent(Aim)!.target = child(t, 0);      // out of extra, into Tank
    player.addComponent(Aim).target = child(extra, 0);
    const s0 = saveLink(); // first save mints
    reload(s0);
    const s1 = saveLink();
    const [p, r] = reload(s1);
    const e = child(r, 3);
    expect(child(e, 0).getComponents(Tag)[1].label).toBe("EXTRA");
    expect(child(e, 0).getComponent(Aim)!.target).toBe(child(r, 0));
    expect(p.getComponent(Aim)!.target).toBe(child(e, 0));
    expect(saveLink()).toEqual(s1);
});

test("two Tags, the first removed in the instance: a reference to the remaining one survives a link round trip and a prefab edit", () => {
    const { tank } = world();
    const player = new GameObject("Player");
    const t = tank.instantiate();
    const rb = child(t, 2, 0);
    rb.removeComponent(rb.getComponents(Tag)[0] as never);
    player.addComponent(Pick).comp = rb.getComponents(Tag)[0];
    const s1 = saveLink();
    const [p, r] = reload(s1);
    const tags = child(r, 2, 0).getComponents(Tag);
    expect(tags.map(c => c.label)).toEqual(["second"]);
    expect(p.getComponent(Pick)!.comp).toBe(tags[0]);
});

test("a removed nested instance, reverted, is rebuilt and the outer's reference to it comes back", () => {
    const { tank } = world();
    const t = tank.instantiate();
    t.addComponent(Aim).target = child(t, 2);   // added component on root aiming at Turret R
    const removed = child(t, 2);
    const id = removed.prefabNodeId!;
    removed.destroyImmediate();
    tank.revertOverride(t, id);
    expect(t.transform.childCount).toBe(3);
    expect(child(t, 2).transform.childCount).toBe(1);
    expect(child(t, 2).getComponent(Aim)!.target).toBe(child(t, 2, 0));
});
