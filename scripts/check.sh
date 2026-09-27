#!/usr/bin/env bash
# Every static check an extension gets in CI. Usage: scripts/check.sh extensions/<name>
# Set TINYCAST_RUNTIME to a tinycast checkout's Scripts/raycast-runtime to also smoke-run the
# built commands in Tinycast's own JS runtime.
set -euo pipefail

dir=$(cd "$1" && pwd)
name=$(basename "$dir")
out="${OUT_DIR:-$(mktemp -d)}/$name"
runtime="${TINYCAST_RUNTIME:+$(cd "$TINYCAST_RUNTIME" && pwd)}"
cd "$dir"

step() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$name · $1"; else echo "▶ $name · $1"; fi
}
end() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi; }

step install
bun install --frozen-lockfile
end

step typecheck
node_modules/.bin/tsc --noEmit
end

# Manifest, icons, ESLint and Prettier — the same gate raycast/extensions runs.
step lint
CI=1 node_modules/.bin/ray lint
end

if [ -n "$(find src -name '*.test.ts' -o -name '*.test.tsx' | head -n1)" ]; then
  step test
  bun test
  end
fi

# Exactly what Tinycast's registry install runs: `dist`, into a directory beside the source.
step build
rm -rf "$out"
node_modules/.bin/ray build -e dist -o "$out"
end

if [ -n "$runtime" ]; then
  for command in $(bun -e 'console.log(require("./package.json").commands.map((c) => c.name).join("\n"))'); do
    step "tinycast runtime · $command"
    bun "$runtime/test.mjs" "$out" "$command"
    end
  done
fi
