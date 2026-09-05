import { describe, expect, it } from "bun:test";
import {
  GitIdentitySchema,
  ProviderAccountSchema,
  DirectoryRuleSchema,
  MainConfigSchema,
} from "@/core/config/schema";

describe("Config Schemas", () => {
  it("validates a complete Git identity", () => {
    const valid = {
      id: "personal",
      name: "Fuad Tesfaye",
      email: "personal@example.com",
      signingKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...",
      isDefault: true,
    };

    const parsed = GitIdentitySchema.parse(valid);
    expect(parsed.id).toBe("personal");
    expect(parsed.email).toBe("personal@example.com");
    expect(parsed.isDefault).toBe(true);
    expect(parsed.createdAt).toBeDefined();
  });

  it("fails when email is invalid", () => {
    const invalid = {
      id: "work",
      name: "Fuad",
      email: "not-an-email",
    };

    expect(() => GitIdentitySchema.parse(invalid)).toThrow();
  });

  it("validates provider account", () => {
    const account = {
      id: "github_corp",
      providerId: "github",
      host: "github.com",
      username: "fuad-corp",
      displayName: "Fuad (Corp)",
      authType: "oauth",
      sshKeyPath: "~/.ssh/id_ed25519",
    };

    const parsed = ProviderAccountSchema.parse(account);
    expect(parsed.id).toBe("github_corp");
    expect(parsed.providerId).toBe("github");
  });

  it("validates directory rule", () => {
    const rule = {
      id: "work_rule",
      path: "~/Projects/company",
      identityId: "work",
      defaultProvider: "github",
      defaultAccountId: "github_corp",
    };

    const parsed = DirectoryRuleSchema.parse(rule);
    expect(parsed.id).toBe("work_rule");
    expect(parsed.path).toBe("~/Projects/company");
  });

  it("parses default main config", () => {
    const parsed = MainConfigSchema.parse({});
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.enabled).toBe(true);
    expect(parsed.rules).toEqual([]);
    expect(parsed.settings.credentialHelperEnabled).toBe(true);
  });

  it("handles null values cleanly in ProviderAccountSchema and AccountsFileSchema without throwing", async () => {
    const { AccountsFileSchema } = await import("@/core/config/schema");
    const accountWithNulls = {
      id: "github_moahmed325",
      providerId: "github",
      host: "github.com",
      username: "moahmed325",
      displayName: null,
      email: null,
      identityId: null,
      authType: "oauth",
      sshKeyPath: null,
      sshPort: null,
    };

    const parsed = ProviderAccountSchema.parse(accountWithNulls);
    expect(parsed.id).toBe("github_moahmed325");
    expect(parsed.email).toBeUndefined();
    expect(parsed.displayName).toBeUndefined();
    expect(parsed.sshKeyPath).toBeUndefined();

    const fileParsed = AccountsFileSchema.parse({
      accounts: [accountWithNulls],
    });
    expect(fileParsed.accounts.length).toBe(1);
    expect(fileParsed.accounts[0].email).toBeUndefined();
  });
});
