# tinycast-extensions

A personal Tinycast extension registry, laid out like `raycast/extensions`: one folder per
extension under `extensions/`, each a regular Raycast extension built with `ray build`.

Add it in Tinycast under Settings → Extensions → Registries with the URL
`https://github.com/ajchemist/tinycast-extensions`.

| Extension | What it does |
| --- | --- |
| [`gopass`](extensions/gopass) | Raycast's gopass extension, plus `otpauth://` OTP generation with live countdown rings |
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
6. each built command, run in Tinycast's own JS runtime from `ajchemist/tinycast@personal`

Run the same locally:

```sh
TINYCAST_RUNTIME=../../abue-ammar/tinycast/trunk/Scripts/raycast-runtime scripts/check.sh extensions/<name>
```
