// Functional smoke tests: runs a built extension in Tinycast's own JS runtime and drives it the way
// the palette does — reading the rendered tree, typing into the search bar, running actions.
//
// Usage: bun scripts/smoke.mjs <extension name> <built extension dir>
// Needs TINYCAST_RUNTIME (a tinycast checkout's Scripts/raycast-runtime). Scenarios live in
// smoke/<extension name>.mjs and default-export `async (t) => { … }`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [name, builtDir] = process.argv.slice(2);
const runtimeDir = process.env.TINYCAST_RUNTIME;
if (!name || !builtDir || !runtimeDir) {
  console.error("usage: TINYCAST_RUNTIME=<dir> bun scripts/smoke.mjs <extension> <built dir>");
  process.exit(2);
}

const { createHarness, bootConfig, describeTree } = await import(
  pathToFileURL(resolve(runtimeDir, "test.mjs")).href
);
const manifest = JSON.parse(readFileSync(join(builtDir, "package.json"), "utf8"));

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/// Every node under `node`, including the ones Raycast passes as props (`actions`, `detail`, …).
function* walk(node) {
  if (!node || typeof node !== "object") return;
  if (node.type) yield node;
  for (const value of Object.values(node.props ?? {})) {
    if (value && typeof value === "object" && value.type) yield* walk(value);
  }
  for (const child of node.children ?? []) yield* walk(child);
}

function textOf(value) {
  if (typeof value === "string") return value;
  return value?.text ?? value?.value ?? "";
}

class Session {
  /// `home` is what `os.homedir()` and `$HOME` report to the extension and the children it spawns.
  constructor(command, { stubs = {}, preferences = {}, home } = {}) {
    this.command = manifest.commands.find((c) => c.name === command);
    if (!this.command) throw new Error(`no command ${command} in ${manifest.name}`);
    this.calls = [];
    const recorded = {};
    const answers = { "feedback.confirmAlert": () => true, ...stubs };
    for (const call of [
      "clipboard.copy",
      "clipboard.paste",
      "feedback.showHUD",
      "feedback.showToast",
      "feedback.updateToast",
      "feedback.confirmAlert",
      "window.close",
      "window.popToRoot",
      ...Object.keys(answers),
    ]) {
      recorded[call] = (args) => {
        this.calls.push({ name: call, args });
        return answers[call] ? answers[call](args) : call === "feedback.showToast" ? "toast" : null;
      };
    }
    this.harness = createHarness({ stubs: recorded });
    const file = join(builtDir, `${this.command.name}.js`);
    const base = bootConfig();
    const node = home ? { ...base.node, homedir: home, cwd: home, env: { ...base.node.env, HOME: home } } : base.node;
    this.harness.boot(
      bootConfig({
        node,
        environment: {
          ...base.environment,
          extensionName: manifest.name,
          commandName: this.command.name,
          commandMode: this.command.mode,
          assetsPath: join(builtDir, "assets"),
        },
        preferences,
      }),
    );
    const mode = this.command.mode === "view" ? "view" : "no-view";
    this.harness.start("s1", readFileSync(file, "utf8"), file, builtDir, mode, {});
  }

  get state() {
    return this.harness.state;
  }

  /// The screen on top of the navigation stack.
  screen() {
    const tree = this.state.trees.at(-1);
    if (!tree) return undefined;
    const screens = (tree.children ?? []).filter((child) => child.type === "__screen");
    return screens.length ? (screens.find((s) => s.props?.active) ?? screens.at(-1)) : tree;
  }

  nodes(type, where = () => true) {
    return [...walk(this.screen())].filter((node) => node.type === type && where(node));
  }

  items(type = "List.Item") {
    return this.nodes(type).map((node) => node.props.title);
  }

  item(title, type = "List.Item") {
    const found = this.nodes(type, (node) => node.props.title === title)[0];
    assert.ok(found, `no ${type} titled "${title}" in:\n${this.dump()}`);
    return found;
  }

  /// Runs the action titled `title` from `owner`'s action panel (or the screen's own).
  async act(title, owner = this.screen()) {
    const action = [...walk(owner)].find((node) => node.type?.startsWith("Action") && node.props?.title === title);
    assert.ok(action?.props?.onAction?.$fn, `no action "${title}" in:\n${describeTree({ children: [owner] })}`);
    this.harness.dispatch("s1", action.props.onAction.$fn);
    await sleep(50);
  }

  /// Runs the form's primary action, as ⌘↵ does; the runtime renders `SubmitForm` as an `Action`.
  async submit() {
    const panel = this.nodes("Form")[0]?.props?.actions;
    const action = [...walk(panel)].find((node) => node.type === "Action");
    assert.ok(action?.props?.onAction?.$fn, `no submit action in:\n${this.dump()}`);
    this.harness.dispatch("s1", action.props.onAction.$fn);
    await sleep(50);
  }

  /// Types into the search bar of the top screen's List or Grid.
  async search(text) {
    const list = this.nodes("List")[0] ?? this.nodes("Grid")[0];
    assert.ok(list?.props?.onSearchTextChange?.$fn, "the screen has no search handler");
    this.harness.dispatch("s1", list.props.onSearchTextChange.$fn, [text]);
    await sleep(50);
  }

  /// Sets a form field the way the palette does when the user edits it.
  async fill(id, value) {
    const field = this.nodes("Form.TextField", (n) => n.props.id === id)[0] ?? this.nodes("Form.TextArea", (n) => n.props.id === id)[0];
    assert.ok(field?.props?.onTinycastChange?.$fn, `no form field "${id}" in:\n${this.dump()}`);
    this.harness.dispatch("s1", field.props.onTinycastChange.$fn, [value]);
    await sleep(50);
  }

  /// Polls until `check` returns something truthy; fails with the current tree when it never does.
  async until(check, what, timeout = 8000) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await check();
        if (last) return last;
      } catch (error) {
        last = error;
      }
      await sleep(50);
    }
    throw new Error(`timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ""}\n${this.dump()}`);
  }

  called(name) {
    return this.calls.filter((call) => call.name === name).map((call) => call.args);
  }

  /// The text an extension copied or pasted, whatever shape the content took.
  clipboard(name = "clipboard.copy") {
    return this.called(name).map((args) => textOf(args[0]));
  }

  dump() {
    const screen = this.screen();
    const logs = this.state.logs.slice(-10).join("\n");
    return `${screen ? describeTree({ children: [screen] }) : "(nothing rendered)"}\n${logs}`;
  }

  stop() {
    this.harness.stop("s1");
  }
}

let open = [];

const scenarios = [];
const t = {
  assert,
  sleep,
  manifest,
  launch: (command, options) => {
    const session = new Session(command, options);
    open.push(session);
    return session;
  },
  test: (title, body) => scenarios.push({ title, body }),
};

const module = await import(pathToFileURL(resolve("smoke", `${name}.mjs`)).href);
await module.default(t);

let failed = 0;
for (const { title, body } of scenarios) {
  try {
    await body();
    for (const session of open) {
      assert.deepEqual(session.state.failures, [], `the runtime reported failures:\n${session.dump()}`);
    }
    console.log(`  ✓ ${title}`);
  } catch (error) {
    failed++;
    console.log(`  ✗ ${title}\n${String(error?.stack ?? error).replace(/^/gm, "      ")}`);
  } finally {
    for (const session of open) session.stop();
    open = [];
  }
}
console.log(`\n${scenarios.length - failed}/${scenarios.length} smoke scenarios passed`);
process.exit(failed ? 1 : 0);
