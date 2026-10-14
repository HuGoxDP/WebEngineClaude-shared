import { test, expect } from "vitest";
import { GameObject } from "../../src/engine/core/GameObject";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { SceneManager } from "../../src/engine/core/SceneManager";
import { UIImage } from "../../src/engine/core/ui/UIImage";
import { RectTransform } from "../../src/engine/core/ui/RectTransform";
import { Vector2 } from "../../src/engine/core/math/Vector2";
import { Canvas } from "../../src/engine/core/ui/Canvas";

const out = (s: string) => process.stderr.write(s + "\n");
test("UI object round trip", () => {
    for (const r of [...SceneManager.activeScene.getRootGameObjects()]) r.destroyImmediate();
    const c = new GameObject("C"); c.addComponent(Canvas);
    const a = new GameObject("auto"); a.transform.setParent(c.transform); a.addComponent(UIImage); a.getComponent(RectTransform)!.sizeDelta = new Vector2(321, 45);
    const e = new GameObject("explicit"); e.transform.setParent(c.transform); e.addComponent(RectTransform); e.addComponent(UIImage);
    out(`before auto=${a.getAllComponents().map(x => x.constructor.name)} explicit=${e.getAllComponents().map(x => x.constructor.name)}`);
    const s = SceneSerializer.serializeScene(SceneManager.activeScene);
    for (const r of [...SceneManager.activeScene.getRootGameObjects()]) r.destroyImmediate();
    const [back] = SceneSerializer.deserializeScene(s);
    for (let i = 0; i < back.transform.childCount; i++) {
        const g = back.transform.getChild(i).gameObject;
        out(`after ${g.name}=${g.getAllComponents().map(x => x.constructor.name)} first RT sizeDelta=${JSON.stringify(g.getComponent(RectTransform)?.sizeDelta)} image.rectTransform===first ${(g.getComponent(UIImage) as any)?.rectTransform === g.getComponent(RectTransform)}`);
    }
    const copy = SceneSerializer.deserializeGameObject(SceneSerializer.serializeGameObject(a));
    out(`deserializeGameObject(auto) => ${copy.getAllComponents().map(x => x.constructor.name)}`);
    expect(true).toBe(true);
});
