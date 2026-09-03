import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProviderRegistry } from "@/core/providers/provider-registry";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";

describe("ProviderRegistry", () => {
  let tempDir: string;
  let store: ConfigStore;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-prov-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("registers standard built-in providers with capabilities", () => {
    const registry = new ProviderRegistry();
    const list = registry.listSupported();
    expect(list.length).toBeGreaterThanOrEqual(3);

    const gh = registry.get("github");
    expect(gh?.name).toBe("GitHub");
    expect(gh?.defaultHost).toBe("github.com");
    expect(gh?.capabilities.oauth).toBe(true);
    expect(gh?.capabilities.deviceCode).toBe(true);

    const gl = registry.get("gitlab");
    expect(gl?.name).toBe("GitLab");
    expect(gl?.capabilities.passwordAuth).toBe(true);
    expect(gl?.capabilities.selfHosted).toBe(true);

    const bb = registry.get("bitbucket");
    expect(bb?.name).toBe("Bitbucket");
    expect(bb?.capabilities.tokenAuth).toBe(true);
  });

  it("finds provider by hostname", () => {
    const registry = new ProviderRegistry();
    expect(registry.getByHost("github.com")?.id).toBe("github");
    expect(registry.getByHost("gitlab.com")?.id).toBe("gitlab");
    expect(registry.getByHost("bitbucket.org")?.id).toBe("bitbucket");
  });

  it("manages selective provider enablement cleanly", () => {
    const registry = new ProviderRegistry();

    // Initially, github is enabled by default
    expect(registry.isProviderEnabled("github", store)).toBe(true);
    expect(registry.isProviderEnabled("gitlab", store)).toBe(false);

    // Enable gitlab
    registry.enableProvider("gitlab", store);
    expect(registry.isProviderEnabled("gitlab", store)).toBe(true);

    const enabled = registry.listEnabled(store);
    const enabledIds = enabled.map((p) => p.id);
    expect(enabledIds).toContain("github");
    expect(enabledIds).toContain("gitlab");
    expect(enabledIds).not.toContain("bitbucket");

    // Disable github
    registry.disableProvider("github", store);
    expect(registry.isProviderEnabled("github", store)).toBe(false);

    // Check states
    const stateGitlab = registry.getInstallationState("gitlab", store);
    expect(stateGitlab.enabled).toBe(true);
    expect(stateGitlab.status).toBe("enabled");

    const stateBitbucket = registry.getInstallationState("bitbucket", store);
    expect(stateBitbucket.enabled).toBe(false);
    expect(stateBitbucket.status).toBe("available");
  });
});
