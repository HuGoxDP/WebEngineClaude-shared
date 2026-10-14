import { test } from "vitest";
import { Tag, Aim, Pick, clear, child, world, saveLink, GameObject } from "./zz_probe_common";
test("dump", () => {
    clear();
    const { tank } = world();
    const player = new GameObject("Player");
    const aim = player.addComponent(Aim);
    const pick = player.addComponent(Pick);
    const t = tank.instantiate();
    const left = child(t, 1);
    const right = child(t, 2);
    const rightBarrel = child(right, 0);
    aim.target = rightBarrel;
    pick.comp = rightBarrel.getComponents(Tag)[1];
    rightBarrel.getComponent(Aim)!.target = player;
    left.getComponent(Aim)!.target = child(t, 0);
    rightBarrel.getComponents(Tag)[1].label = "R2";
    const s = saveLink();
    delete (s as any).renderSettings;
    for (const r of s.roots) { (r as any).transform = "…"; }
    require("fs").writeFileSync(process.env.OUT ?? "/dev/null", JSON.stringify(s, null, 1));
});
