import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "../../../src/core/config/config-store";
import { PathResolver } from "../../../src/core/config/path-resolver";
import { BridgeService } from "../../src/services/bridge.service";

describe("Extension BridgeService", () => {
  let tempDir: string;
  let store: ConfigStore;
  let bridge: BridgeService;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-ext-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    bridge = new BridgeService(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads identities, accounts, rules and resolves context", async () => {
    bridge.getStore().addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "personal@example.com",
    });

    const identities = bridge.loadIdentities();
    expect(identities.length).toBe(1);
    expect(identities[0].id).toBe("personal");

    const ctx = await bridge.resolveContext(tempDir);
    expect(ctx.source).toBe("global_default");
    expect(ctx.identity?.id).toBe("personal");
  });

  it("adds and switches identities via bridge", async () => {
    await bridge.addIdentity({
      id: "work",
      name: "Fuad Work",
      email: "work@company.com",
      isDefault: false,
    });

    let identities = bridge.loadIdentities();
    expect(identities.length).toBe(1);

    await bridge.setIdentity("work", undefined, true);
    expect(bridge.loadConfig().defaultIdentityId).toBe("work");
  });
});
