import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProviderDetector } from "@/core/providers/provider-detector";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";

describe("ProviderDetector", () => {
  let tempDir: string;
  let store: ConfigStore;
  let detector: ProviderDetector;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-detector-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    detector = new ProviderDetector(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accurately detects standard cloud providers from remote URLs", () => {
    const gh = detector.detectFromRemote("git@github.com:FuadTesfaye/gitbridge.git");
    expect(gh.providerId).toBe("github");
    expect(gh.name).toBe("GitHub");
    expect(gh.confidence).toBe(1.0);
    expect(gh.isKnown).toBe(true);

    const gl = detector.detectFromRemote("https://gitlab.com/fuadt/private-project.git");
    expect(gl.providerId).toBe("gitlab");
    expect(gl.name).toBe("GitLab");
    expect(gl.confidence).toBe(1.0);

    const bb = detector.detectFromRemote("git@bitbucket.org:company/repo.git");
    expect(bb.providerId).toBe("bitbucket");
    expect(bb.name).toBe("Bitbucket");
  });

  it("detects registered accounts for custom hosts and self-hosted instances", () => {
    // Add custom account
    store.addAccount({
      id: "gitlab_insa",
      providerId: "gitlab",
      host: "172.27.23.116",
      username: "fuadt",
      authType: "oauth",
    });

    const res = detector.detectFromRemote("http://172.27.23.116/fuadt/fleet.git");
    expect(res.providerId).toBe("gitlab");
    expect(res.host).toBe("172.27.23.116");
    expect(res.isKnown).toBe(true);
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("returns unknown/custom provider for unrecognized endpoints", () => {
    const res = detector.detectFromRemote("https://git.unknowncorp.internal/team/repo.git");
    expect(res.providerId).toBe("custom");
    expect(res.isKnown).toBe(false);
    expect(res.confidence).toBe(0.5);
  });

  it("inspects system environment and reports existing git tooling and accounts", async () => {
    const discovery = await detector.detectSystemProviders();
    expect(typeof discovery.gitInstalled).toBe("boolean");
    expect(Array.isArray(discovery.detectedProviders)).toBe(true);
    expect(discovery.detectedProviders.length).toBeGreaterThanOrEqual(3);

    const gh = discovery.detectedProviders.find((p) => p.providerId === "github");
    expect(gh).toBeDefined();
    expect(gh?.name).toBe("GitHub");
  });
});
