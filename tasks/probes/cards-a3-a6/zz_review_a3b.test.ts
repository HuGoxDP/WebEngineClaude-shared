import { test, expect } from "vitest";
import { GameObject } from "../../src/engine/core/GameObject";
import { EngineObject } from "../../src/engine/core/EngineObject";
import { ScriptableBehaviour } from "../../src/engine/core/ScriptableBehaviour";
import { LODGroup } from "../../src/engine/core/components/LODGroup";

test("P1b component added during teardown that registers per frame", () => {
    let bred: LODGroup | null = null;
    class Breeder extends ScriptableBehaviour {
        public override onDisable(): void { if (!bred) bred = this.gameObject.addComponent(LODGroup); }
    }
    const go = new GameObject("go");
    go.addComponent(Breeder);
    go.destroyImmediate();
    const reg = (LODGroup as any)._activeInstances.size;
    process.stderr.write(`P1b go.exists ${go.exists()} bred.exists ${bred!.exists()} lodRegistry ${reg} isActiveAndEnabled ${bred!.isActiveAndEnabled} found ${EngineObject.FindObjectsOfType(LODGroup, true).length}\n`);
    let threw: unknown = null;
    try { (LODGroup as any)._updateAll(); } catch (e) { threw = e; }
    process.stderr.write(`P1b _updateAll threw ${threw}\n`);
    expect(bred!.exists()).toBe(false);
});
