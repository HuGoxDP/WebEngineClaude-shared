import { test, expect } from "vitest";
import { GameObject } from "../../src/engine/core/GameObject";
import { Behaviour } from "../../src/engine/core/Behaviour";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { AssetDatabase } from "../../src/engine/core/assets/AssetDatabase";
import { Serializable, SerializedField } from "../../src/engine/core/reflection/Decorators";
import { UIImage } from "../../src/engine/core/ui/UIImage";

@Serializable({ typeName: "Rev.A" }) class A extends Behaviour { @SerializedField() public v = 1; }
@Serializable({ typeName: "Rev.B" }) class B extends Behaviour { @SerializedField() public w = 2; }
const out = (s: string) => process.stderr.write(s + "\n");
const strip = (c: unknown) => JSON.stringify(c, (k, v) => (k === "fields" ? "…" : v)).replace(/"node":"[^"]+"/g, '"node":"#"');

test("shape diff after removing the first of two components", () => {
    let n = 0;
    for (const [label, build, victimType] of [
        ["[A,B]", (g: GameObject) => { g.addComponent(A); g.addComponent(B); }, A],
        ["[UIImage,(auto)RectTransform]", (g: GameObject) => { g.addComponent(UIImage); }, UIImage],
    ] as const) {
        for (const how of ["removeComponent", "destroyImmediate"] as const) {
            const src = new GameObject("P"); build(src);
            const p = Prefab.fromGameObject(src); src.destroyImmediate(); AssetDatabase._bindGuid("g" + (n++), p);
            const inst = p.instantiate();
            const victim = inst.getComponent(victimType as never)!;
            if (how === "removeComponent") inst.removeComponent(victim); else (victim as Behaviour).destroyImmediate();
            out(`${label} ${how}: components ${inst.getAllComponents().map(c => c.constructor.name)} changes ${strip(p.getChanges(inst))}`);
        }
    }
    expect(true).toBe(true);
});
