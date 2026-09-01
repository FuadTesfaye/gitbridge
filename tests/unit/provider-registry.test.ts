import { describe, expect, it } from "bun:test";
import { ProviderRegistry } from "@/core/providers/provider-registry";

describe("ProviderRegistry", () => {
  it("registers standard built-in providers", () => {
    const registry = new ProviderRegistry();
    const list = registry.list();
    expect(list.length).toBeGreaterThanOrEqual(3);

    const gh = registry.get("github");
    expect(gh?.name).toBe("GitHub");
    expect(gh?.defaultHost).toBe("github.com");

    const gl = registry.get("gitlab");
    expect(gl?.name).toBe("GitLab");

    const bb = registry.get("bitbucket");
    expect(bb?.name).toBe("Bitbucket");
  });

  it("finds provider by hostname", () => {
    const registry = new ProviderRegistry();
    expect(registry.getByHost("github.com")?.id).toBe("github");
    expect(registry.getByHost("gitlab.com")?.id).toBe("gitlab");
    expect(registry.getByHost("bitbucket.org")?.id).toBe("bitbucket");
  });
});
