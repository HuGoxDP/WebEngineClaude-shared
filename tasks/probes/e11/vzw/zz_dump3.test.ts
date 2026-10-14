import { test } from "vitest";
import { clear, child, obj, prefabFrom, saveLink, quiet } from "./zz_probe_common";
test("dump", () => {
    clear();
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const t = tank.instantiate();
    child(t, 1, 1).transform.setSiblingIndex(0);
    const w = quiet();
    const s = saveLink();
    const calls = w.calls();
    w.restore();
    require("fs").writeFileSync(process.env.OUT!, JSON.stringify({ warn: calls, tank: s.roots[0].prefab }, null, 0));
});
