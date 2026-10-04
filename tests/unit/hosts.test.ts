import { describe, expect, it } from "bun:test";
import { normalizeHost, hostsEqual, hostMatchesBase, detectCloudProviderFromHost } from "@/utils/hosts";

describe("host comparison keeps non-default ports", () => {
  it("normalizes case, scheme and path but keeps a non-default port", () => {
    expect(normalizeHost("https://GIT.CORP:8443/group/repo.git")).toBe("git.corp:8443");
    expect(normalizeHost("GIT.CORP:8443")).toBe("git.corp:8443");
  });

  it("drops only the HTTPS default port", () => {
    expect(normalizeHost("github.com:443")).toBe("github.com");
    expect(hostsEqual("github.com:443", "github.com")).toBe(true);
    expect(detectCloudProviderFromHost("github.com:443")).toBe("github");
  });

  it("treats the same hostname on another port as a different service", () => {
    expect(hostsEqual("git.corp:8443", "git.corp")).toBe(false);
    expect(hostsEqual("git.corp:8443", "git.corp:8443")).toBe(true);
    expect(hostMatchesBase("git.corp:8443", "git.corp")).toBe(false);
    expect(hostMatchesBase("gist.github.com", "github.com")).toBe(true);
  });
});
