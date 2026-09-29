# tinycast-extensions

A personal Tinycast extension registry, laid out like `raycast/extensions`: one folder per
extension under `extensions/`, each a regular Raycast extension built with `ray build`.

Add it in Tinycast under Settings → Extensions → Registries with the URL
`https://github.com/ajchemist/tinycast-extensions`.

| Extension | What it does |
| --- | --- |
| [`gopass-tc`](extensions/gopass-tc) | Raycast's gopass extension, plus `otpauth://` OTP generation with live countdown rings |
| [`window-tools`](extensions/window-tools) | Personal window commands — Almost Maximize (Stage Manager): maximize while keeping the Stage Manager strip visible |

## Working on an extension

```sh
cd extensions/<name>
bun install
bun run dev     # ray develop
```

## Checks

CI runs `scripts/check.sh` for every folder under `extensions/`, on each push, pull request and
daily after Tinycast Personal's nightly build:

1. `bun install --frozen-lockfile`
2. `tsc --noEmit`
3. `ray lint` — manifest, icons, ESLint and Prettier
4. `bun test`, when the extension has `*.test.ts`
5. `ray build -e dist`, exactly what Tinycast's registry install runs
6. in Tinycast's own JS runtime from `ajchemist/tinycast@personal`: the scenarios in
   `smoke/<name>.mjs` when there are any, otherwise each command is launched once

## Smoke scenarios

`scripts/smoke.mjs` runs a built extension the way the palette does — it reads the rendered tree,
types into the search bar, runs actions, fills and submits forms, and records host calls such as
clipboard writes and `setWindowBounds`. A scenario file default-exports `async (t) => { … }`:

```js
t.test("pastes an entry's password", async () => {
  const session = t.launch("index");
  await session.until(() => session.items().includes("solo"), "the listing");
  await session.act("Paste Password to Active App", session.item("solo"));
  t.assert.deepEqual(session.clipboard("clipboard.paste"), ["solo-secret"]);
});
```

`smoke/<name>.ci-setup.sh`, when present, prepares the CI runner first — `gopass-tc` installs the
gopass CLI. The gopass-tc scenarios run it against a throwaway store under a temporary `HOME`, with the
unencrypted `plain` backend, so they never touch a real password store.

Run the same locally:

```sh
TINYCAST_RUNTIME=../../abue-ammar/tinycast/trunk/Scripts/raycast-runtime scripts/check.sh extensions/<name>
```
