import { test, beforeEach, afterEach } from "vitest";
import { log } from "./log";
import { Tag, Aim, clear, child, world, GameObject, AssetDatabase } from "../vzw/zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
const ids = (g: GameObject, d = 0): string => `${" ".repeat(d)}${g.name} id=${g._prefabNodeId}\n` + Array.from({ length: g.transform.childCount }, (_, i) => ids(child(g, i), d + 1)).join("");
test("explore", () => {
    const { tank } = world();
    const t = tank.instantiate();
    const flag = new GameObject("Flag");
    flag.transform.setParent(t.transform, false);
    flag.transform.setSiblingIndex(0);
    log("explore", ids(t));
    log("explore", JSON.stringify(tank.getChanges(t)).slice(0, 400));
    log("explore", ids(t));
});
