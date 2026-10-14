import { test } from "vitest";
import * as fs from "node:fs";
import { clear, child, GameObject, Prefab, AssetDatabase } from "../vzw/zz_probe_common";
import { log } from "./log";
test("old prefab instance ids", () => {
    const p = Prefab.fromJSON(JSON.parse(fs.readFileSync("/tmp/claude-0/-home-user/18df1101-ad89-5883-a34b-4290928909de/scratchpad/a1-review-sem/oldout/tank.prefab.json", "utf8")));
    AssetDatabase._bindGuid("guid-old", p);
    const i = p.instantiate();
    const ids = (g: GameObject): any => [g._prefabNodeId, Array.from({ length: g.transform.childCount }, (_, k) => ids(child(g, k)))];
    log("oldids", ids(i));
});
