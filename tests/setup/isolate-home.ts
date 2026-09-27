/**
 * Test sandbox: every `bun test` run gets a throwaway home directory.
 *
 * Several code paths write to the user's home (~/.gitconfig, ~/.ssh/config,
 * shell profiles, editor settings.json, the credential vault). Pointing HOME,
 * XDG_CONFIG_HOME and GITBRIDGE_HOME at a temp dir before any test module
 * loads means a stray default-store call can never reach the real files.
 * Tests that exercise those paths should still pass an explicit sandbox home
 * as the second PathResolver argument so the intent is visible in the test.
 *
 * afterAll() in a preload runs once at the end of the whole run (not per
 * file), which is where the sandbox is removed. process.on("exit") is not
 * reliable under `bun test`.
 */
import { afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitbridge-test-home-"));
const home = path.join(root, "home");
const configDir = path.join(home, ".config");
fs.mkdirSync(configDir, { recursive: true });

process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.XDG_CONFIG_HOME = configDir;
process.env.GITBRIDGE_HOME = path.join(home, ".gitbridge");

afterAll(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    // best effort
  }
});
