# tinycast-extensions

A personal Tinycast extension registry, laid out like `raycast/extensions`: one folder per
extension under `extensions/`, each a regular Raycast extension built with `ray build`.

Add it in Tinycast under Settings → Extensions → Registries with the URL
`https://github.com/ajchemist/tinycast-extensions`.

| Extension | What it does |
| --- | --- |
| [`almost-maximize-stage-manager`](extensions/almost-maximize-stage-manager) | Maximize the focused window while keeping the Stage Manager strip visible |

## Working on an extension

```sh
cd extensions/<name>
bun install
bun test
bun run build   # ray build -e dist
```
