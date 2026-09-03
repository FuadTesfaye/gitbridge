import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "../../../src/core/config/config-store";
import { PathResolver } from "../../../src/core/config/path-resolver";
import { BridgeService } from "../../src/services/bridge.service";

import { defaultProviderRegistry } from "../../../src/core/providers/provider-registry";

describe("Extension Status Bar & Context Logic", () => {
  let tempDir: string;
  let store: ConfigStore;
  let bridge: BridgeService;

  beforeEach(() => {
    for (const p of defaultProviderRegistry.list()) {
      p.checkHealth = async () => ({ apiOk: true, pingMs: 10, message: "OK" });
    }
    tempDir = path.join(os.tmpdir(), `gitbridge-status-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
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

  it("resolves status text accurately for mapped directory rules", async () => {
    store.addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "personal@example.com",
      isDefault: true,
    });

    store.addIdentity({
      id: "work",
      name: "Fuad Work",
      email: "work@company.com",
      isDefault: false,
    });

    const workDir = path.join(tempDir, "company", "service-a");
    fs.mkdirSync(workDir, { recursive: true });

    store.addRule({
      id: "rule_company",
      path: path.join(tempDir, "company"),
      identityId: "work",
    });

    const ctx = await bridge.resolveContext(workDir);
    expect(ctx.source).toBe("directory_rule");
    expect(ctx.identity?.id).toBe("work");
    expect(ctx.identity?.email).toBe("work@company.com");
  });

  it("handles diagnostics generation cleanly", async () => {
    const report = await bridge.runDiagnostics();
    expect(report).toContain("GitBridge System Diagnostics");
    expect(report).toContain("Provider Connectivity");
  });
});
