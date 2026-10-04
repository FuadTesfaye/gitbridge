import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitCredentialHelperHandler } from "@/cli/commands/credential";
import { StoreFactory } from "@/core/storage/store-factory";

describe("Credential helper username matching", () => {
  let tempDir: string;
  let store: ConfigStore;
  let handler: GitCredentialHelperHandler;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gb-cred-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    handler = new GitCredentialHelperHandler(store);

    store.setEnabled(true);
    store.addAccount({
      id: "github_alice",
      providerId: "github",
      host: "github.com",
      username: "alice",
      authType: "pat",
    });
    const credStore = await StoreFactory.getStore(paths, true);
    await credStore.set("github.com", "github_alice", "ghp_alice_token");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("answers a request without a username from the single account for the host", async () => {
    const output = await handler.handleGet("protocol=https\nhost=github.com\n", tempDir);
    expect(output).toContain("username=alice");
    expect(output).toContain("password=ghp_alice_token");
  });

  it("answers a request for the matching username", async () => {
    const output = await handler.handleGet("protocol=https\nhost=github.com\nusername=alice\n", tempDir);
    expect(output).toContain("password=ghp_alice_token");
  });

  it("does not hand another user's token to git when a different username was requested", async () => {
    const output = await handler.handleGet("protocol=https\nhost=github.com\nusername=bob\n", tempDir);
    expect(output).toBe("");
  });
});
