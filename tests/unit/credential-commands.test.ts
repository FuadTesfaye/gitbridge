import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import {
  GitCredentialHelperHandler,
  parseGitCredentialInput,
  handleCredentialCommand,
} from "@/cli/commands/credential";
import { StoreFactory } from "@/core/storage/store-factory";

describe("Credential Commands Unit Tests", () => {
  let tempDir: string;
  let store: ConfigStore;
  let paths: PathResolver;
  let handler: GitCredentialHelperHandler;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gb-cred-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    handler = new GitCredentialHelperHandler(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("parses git credential input stream lines into payload", () => {
    const raw = `protocol=https\nhost=github.com\npath=foo/bar\nusername=fuadt\npassword=secr3t\n`;
    const parsed = parseGitCredentialInput(raw);
    expect(parsed.protocol).toBe("https");
    expect(parsed.host).toBe("github.com");
    expect(parsed.path).toBe("foo/bar");
    expect(parsed.username).toBe("fuadt");
    expect(parsed.password).toBe("secr3t");
  });

  it("stores, retrieves, and erases credentials via handler", async () => {
    const credStore = await StoreFactory.getStore(paths);

    // 1. Store credential
    const storeInput = `protocol=https\nhost=gitlab.com\nusername=developer\npassword=token_xyz\n`;
    await handler.handleStore(storeInput);

    const saved = await credStore.get("gitlab.com", "gitlab_com_developer");
    expect(saved).toBe("token_xyz");

    // 2. Erase credential
    const eraseInput = `protocol=https\nhost=gitlab.com\nusername=developer\n`;
    await handler.handleErase(eraseInput);

    const erased = await credStore.get("gitlab.com", "gitlab_com_developer");
    expect(erased).toBeNull();
  });

  it("runs handleCredentialCommand with provided stdinData string", async () => {
    await handleCredentialCommand("store", "protocol=https\nhost=bitbucket.org\nusername=bb\npassword=bbpass\n");
    await handleCredentialCommand("get", "protocol=https\nhost=bitbucket.org\nusername=bb\n");
    await handleCredentialCommand("erase", "protocol=https\nhost=bitbucket.org\nusername=bb\n");
  });
});
