import { test, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import { Tag, Aim, Pick, clear, child, saveLink, saveExpand, reload, GameObject, SceneSerializer, Prefab, AssetDatabase, SceneManager } from "./zz_probe_common";
import { dumpRoots } from "../vzp/compatFixtures";
const OUT = "/tmp/claude-0/-home-user/18df1101-ad89-5883-a34b-4290928909de/scratchpad/verify-p3-out/nested-old";
const r = (n: string) => JSON.parse(fs.readFileSync(OUT + "/" + n, "utf8"));
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
function bindAll() {
    AssetDatabase._bindGuid("guid-barrel", Prefab.fromJSON(r("barrel.prefab.json")));
    AssetDatabase._bindGuid("guid-turret", Prefab.fromJSON(r("turret.prefab.json")));
    const tank = Prefab.fromJSON(r("tank.prefab.json"));
    AssetDatabase._bindGuid("guid-tank", tank);
    return tank;
}
test("old prefab file instantiates identically", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const tank = bindAll();
    expect(JSON.parse(JSON.stringify(dumpRoots([tank.instantiate()])))).toEqual(r("tank.old.instantiate.dump.json"));
});
test("old scene loads identically, resaves identically in expand, and round-trips in link", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tank = bindAll();
    const roots = SceneSerializer.deserializeScene(r("scene.json"));
    expect(JSON.parse(JSON.stringify(dumpRoots(roots)))).toEqual(r("old.dump.json"));
    const e = saveExpand();
    const oldResave = r("old.resave.json");
    const strip = (x: any): any => JSON.parse(JSON.stringify(x, (k, v) => (k === "id" || k === "prefab") ? undefined : v));
    expect(strip(e)).toEqual(oldResave);
    console.log("EXPAND version", e.version, "identical bytes to old resave:", JSON.stringify(e) === JSON.stringify(oldResave));
    console.log("T1 isPrefabInstance", roots[1].isPrefabInstance, "getOverrides", JSON.stringify(tank.getOverrides(roots[1]).map(o => [o.path, o.component, o.field, o.value])));
    console.log("OLD getOverrides", JSON.stringify(r("old.overrides.t1.reloaded.json").map((o: any) => [o.path, o.component, o.field, o.value])));
    const l1 = saveLink();
    console.log("LINK roots prefab?", l1.roots.map(x => !!x.prefab), "warnings", warn.mock.calls.map(c => String(c[0])));
    const r2 = reload(l1);
    expect(JSON.parse(JSON.stringify(dumpRoots(r2)))).toEqual(r("old.dump.json"));
    expect(saveLink()).toEqual(l1);
});
