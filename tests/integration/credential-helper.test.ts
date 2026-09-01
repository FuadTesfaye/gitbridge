import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitCredentialHelperHandler, parseGitCredentialInput } from "@/cli/commands/credential";
import { StoreFactory } from "@/core/storage/store-factory";

describe("Git Credential Helper", () => {
  let tempDir: string;
  let paths: PathResolver;
  let store: ConfigStore;
  let handler: GitCredentialHelperHandler;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gitbridge-cred-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    handler = new GitCredentialHelperHandler(store);

    // Seed account and token
    store.addAccount({
      id: "github_personal",
      providerId: "github",
      host: "github.com",
      username: "fuad-personal",
      authType: "oauth",
    });

    const credStore = await StoreFactory.getStore(paths, true);
    await credStore.set("github.com", "github_personal", "gho_test_secret_12345");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("parses git credential input stream correctly", () => {
    const raw = "protocol=https\nhost=github.com\npath=myorg/myrepo.git\n\n";
    const payload = parseGitCredentialInput(raw);
    expect(payload.protocol).toBe("https");
    expect(payload.host).toBe("github.com");
    expect(payload.path).toBe("myorg/myrepo.git");
  });

  it("returns username and password when queried for host", async () => {
    const input = "protocol=https\nhost=github.com\npath=myorg/repo.git\n\n";
    const output = await handler.handleGet(input, tempDir);

    expect(output).toContain("username=fuad-personal");
    expect(output).toContain("password=gho_test_secret_12345");
    expect(output.endsWith("\n")).toBe(true);
  });
});
