import { describe, expect, it } from "bun:test";
import { buildAccountId } from "@/core/config/account-id";
import type { ProviderAccount } from "@/core/config/schema";

const existing: ProviderAccount[] = [
  {
    id: "github_alice",
    providerId: "github",
    host: "github.com",
    username: "alice",
    authType: "pat",
    createdAt: new Date().toISOString(),
  },
  {
    // Created by an older version: no host part even though the host is not the default
    id: "gitlab_alice",
    providerId: "gitlab",
    host: "gitlab.corp.example",
    username: "alice",
    authType: "pat",
    createdAt: new Date().toISOString(),
  },
];

describe("buildAccountId", () => {
  it("uses <provider>_<username> for the provider's default host", () => {
    expect(buildAccountId("github", "bob", "github.com", "github.com", existing)).toBe("github_bob");
    expect(buildAccountId("github", "bob", "GitHub.com:443", "github.com", existing)).toBe("github_bob");
  });

  it("adds the host for non-default hosts so enterprise logins do not overwrite the public account", () => {
    expect(buildAccountId("github", "alice", "ghe.corp.example", "github.com", existing)).toBe(
      "github_alice_ghe_corp_example"
    );
    expect(buildAccountId("gitlab", "bob", "gitlab.corp.example:8443", "gitlab.com", existing)).toBe(
      "gitlab_bob_gitlab_corp_example_8443"
    );
  });

  it("keeps the id of an account that already exists for the same provider, host and user", () => {
    expect(buildAccountId("github", "alice", "github.com", "github.com", existing)).toBe("github_alice");
    expect(buildAccountId("gitlab", "alice", "gitlab.corp.example", "gitlab.com", existing)).toBe("gitlab_alice");
  });

  it("sanitizes usernames", () => {
    expect(buildAccountId("github", "al ice/x", "github.com", "github.com", [])).toBe("github_al_ice_x");
  });
});
