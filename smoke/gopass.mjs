// Gopass against a real gopass CLI and a throwaway store: HOME points at a temporary directory and
// the store uses gopass's unencrypted `plain` backend, so no key and no real password is involved.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const OTP_SECRET = "JBSWY3DPEHPK3PXP";
const OTP_URL = `otpauth://totp/Example:alice?secret=${OTP_SECRET}&issuer=Example`;

const home = mkdtempSync(join(tmpdir(), "gopass-smoke-"));
process.env.HOME = home;
process.on("exit", () => rmSync(home, { recursive: true, force: true }));

const gopass = (args, input) =>
  execFileSync("gopass", args, { env: { HOME: home, PATH: process.env.PATH }, input, encoding: "utf8" });

const entries = () => gopass(["list", "--flat"]).split("\n").filter(Boolean).sort();

function seed() {
  rmSync(join(home, ".local"), { recursive: true, force: true });
  rmSync(join(home, ".config"), { recursive: true, force: true });
  gopass(["init", "--crypto", "plain", "--storage", "fs"]);
  gopass(["insert", "-m", "-f", "web/example"], `hunter2\nusername: alice\nurl: https://example.com\ntotp: ${OTP_URL}\n`);
  gopass(["insert", "-m", "-f", "web/other"], "correct-horse\nnote: kept on rename\n");
  gopass(["insert", "-m", "-f", "mail/alice"], "mail-secret\n");
  gopass(["insert", "-m", "-f", "solo"], "solo-secret\n");
}

// The extension's own otpauth, so the expected code comes from an independent call, not the bundle.
const OTPAuth = createRequire(resolve("extensions/gopass/package.json"))("otpauth");
const expectedCodes = () => {
  const totp = OTPAuth.URI.parse(OTP_URL);
  const now = Date.now();
  return [-30_000, 0, 30_000].map((offset) => totp.generate({ timestamp: now + offset }));
};

export default function (t) {
  const launch = async () => {
    const session = t.launch("index");
    await session.until(() => session.items().includes("solo"), "the root listing");
    return session;
  };

  t.test("lists the store's root, folders first", async () => {
    seed();
    const session = await launch();
    t.assert.deepEqual(session.items(), ["mail/", "web/", "solo"]);
  });

  t.test("searches every entry", async () => {
    seed();
    const session = await launch();
    await session.search("example");
    await session.until(() => session.items().join() === "web/example", "a single search result");
  });

  t.test("opens a folder", async () => {
    seed();
    const session = await launch();
    await session.act("Show Details", session.item("web/"));
    await session.until(() => session.items().join() === "example,other", "the folder listing");
  });

  t.test("pastes an entry's password", async () => {
    seed();
    const session = await launch();
    await session.search("example");
    const item = await session.until(() => session.items().includes("web/example") && session.item("web/example"), "the result");
    await session.act("Paste Password to Active App", item);
    await session.until(() => session.clipboard("clipboard.paste").length, "a paste");
    t.assert.deepEqual(session.clipboard("clipboard.paste"), ["hunter2"]);
  });

  t.test("copies a TOTP code generated from the entry's otpauth URL", async () => {
    seed();
    const session = await launch();
    await session.search("example");
    const item = await session.until(() => session.items().includes("web/example") && session.item("web/example"), "the result");
    await session.act("Copy OTP Code to Clipboard", item);
    const [code] = await session.until(() => session.clipboard().length && session.clipboard(), "a copied code");
    t.assert.match(code, /^\d{6}$/);
    t.assert.ok(expectedCodes().includes(code), `${code} is not the TOTP for ${OTP_SECRET}`);
  });

  t.test("shows an entry's attributes and a live OTP code", async () => {
    seed();
    const session = await launch();
    await session.act("Show Details", session.item("web/"));
    const item = await session.until(() => session.items().includes("example") && session.item("example"), "the folder");
    await session.act("Show Details", item);
    await session.until(() => session.items().includes("OTP code"), "the details");
    t.assert.deepEqual(session.items(), ["Password", "OTP code", "Totp", "Username", "URL"]);
    t.assert.equal(session.item("Username").props.subtitle, "alice");
    t.assert.equal(session.item("URL").props.subtitle, "https://example.com");
    t.assert.ok(expectedCodes().includes(session.item("OTP code").props.subtitle));
  });

  t.test("creates a password with attributes", async () => {
    seed();
    const session = await launch();
    await session.act("New Password", session.nodes("List")[0]);
    await session.until(() => session.nodes("Form.TextField", (n) => n.props.id === "name").length, "the form");
    await session.fill("name", "new/entry");
    await session.fill("additionalAttributes", "user: bob");
    await session.submit();
    await session.until(() => session.clipboard().length, "the created password on the clipboard");
    const [password] = session.clipboard();
    const stored = gopass(["show", "new/entry"]).split("\n");
    t.assert.equal(stored[0], password);
    t.assert.ok(stored.includes("user: bob"), stored.join("\n"));
  });

  t.test("renames a password without losing its attributes", async () => {
    seed();
    const session = await launch();
    await session.act("Show Details", session.item("web/"));
    const item = await session.until(() => session.items().includes("other") && session.item("other"), "the folder");
    await session.act("Edit Password", item);
    await session.until(() => session.nodes("Form.TextField", (n) => n.props.value === "web/other").length, "the edit form");
    await session.fill("name", "web/renamed");
    await session.submit();
    await session.until(() => session.clipboard().length, "the updated password on the clipboard");
    await session.until(() => !entries().includes("web/other"), "the old name to go");
    t.assert.deepEqual(session.clipboard(), ["correct-horse"]);
    t.assert.equal(gopass(["show", "web/renamed"]).split("\n")[0], "correct-horse");
    t.assert.ok(gopass(["show", "web/renamed"]).includes("note: kept on rename"));
  });

  t.test("deletes a password after confirmation", async () => {
    seed();
    const session = await launch();
    await session.act("Delete Password", session.item("solo"));
    await session.until(() => !entries().includes("solo"), "the entry to go");
    t.assert.equal(session.called("feedback.confirmAlert").length, 1);
  });

  t.test("keeps a password when deletion is declined", async () => {
    seed();
    const session = t.launch("index", { stubs: { "feedback.confirmAlert": () => false } });
    await session.until(() => session.items().includes("solo"), "the root listing");
    await session.act("Delete Password", session.item("solo"));
    await session.until(() => session.called("feedback.confirmAlert").length, "the confirmation");
    await t.sleep(300);
    t.assert.ok(entries().includes("solo"));
  });
}
