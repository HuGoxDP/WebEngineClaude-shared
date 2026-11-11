# C3 — Engine E4: the type registry accepts a replacement class

Card: `tasks/C` C3 — *"Script reload registers a new constructor under the same `typeName`;
`TypeRegistry.register` refuses a different constructor today (it guards against accidental
collisions). Add an explicit `TypeRegistry.replace(typeName, ctor)` (or a flag) that swaps the
class, keeps the collision error for accidental duplicates, and lets the editor re-instantiate
live components of the old class from their serialized fields. Tests: replace, then deserialize a
scene → instances of the new class; accidental duplicate still throws."* Branch
`C3-type-registry-replace` in `WebEngineTS` (+ `.claude-shared` for the row).

## What was built

`TypeRegistry.replace(typeName, ctor, meta)` in
`src/engine/core/reflection/TypeRegistry.ts`, beside `register`.

Decisions taken where the card left a choice:

- **`replace`, not a flag.** A flag on `register` would make the accidental case one argument
  away from the intended one; an explicit separate method keeps the guard's call site loud.
- **`meta` is passed explicitly.** The refused `register` never stored the new class's metadata,
  and `TypeRegistry` importing `getClassMeta` from `Decorators` would close an import cycle
  (`Decorators` already imports `TypeRegistry`). A host reads it with `getClassMeta(ctor)` — the
  class's own `@Serializable` stored it before `register` ran.
- **The previous class's metadata is kept.** The serializer writes component type names through
  `TypeRegistry.getTypeName` (`_byCtor`), so keeping the old entry lets instances still alive
  under the replaced class keep serializing under the same name — a file saved from a mixed scene
  still loads (as the new class). Re-instantiating the live ones is the host's step: the editor's
  script reload (C4) serializes the old component and deserializes it, which now lands on the new
  class. The engine's part is that the name means the new class from the swap on.
- **Validation, not collision handling.** `replace` throws when the name is not registered or
  when `meta` names something else — those are caller errors, not the accidental-collision case
  `register` guards. Replacing with the same constructor is a no-op.
- `register`'s collision guard is unchanged (log + refuse, the old class stays); its message now
  points at `replace`, so a reload-time collision tells the host what to do.

## Verification

`tests/TypeRegistryReplace.test.ts` (6 tests, pinned):

1. a scene deserialized after the swap instantiates the new class, with the old file's field
   values;
2. an accidental duplicate through `register` still goes nowhere (the first class stays);
3. the old class keeps serializing under the same name after a swap (a straggler round-trips
   into the new class);
4. replacing with the same class is a no-op;
5. replacing an unknown name throws;
6. replacing with metadata that names something else throws.

Engine checks on the task branch: `npm run typecheck` green; `npm test` **2874/2874 green**
(170 files — 2868 plus these 6); `npm run build` green. `CHANGELOG.md` `[Unreleased]` → Added.
