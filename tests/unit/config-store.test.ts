import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";

describe("ConfigStore", () => {
  let tempDir: string;
  let store: ConfigStore;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("initializes empty config and adds first identity as default", () => {
    const identity = store.addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "personal@example.com",
    });

    expect(identity.id).toBe("personal");
    expect(identity.isDefault).toBe(true);

    const identities = store.loadIdentities();
    expect(identities.length).toBe(1);
    expect(identities[0].id).toBe("personal");

    const config = store.loadConfig();
    expect(config.defaultIdentityId).toBe("personal");
  });

  it("manages multiple identities and switches default", () => {
    store.addIdentity({ id: "personal", name: "Fuad P", email: "p@example.com" });
    store.addIdentity({ id: "work", name: "Fuad W", email: "w@company.com" });

    let identities = store.loadIdentities();
    expect(identities.length).toBe(2);
    expect(identities.find((i) => i.id === "personal")?.isDefault).toBe(true);

    store.setDefaultIdentity("work");
    identities = store.loadIdentities();
    expect(identities.find((i) => i.id === "work")?.isDefault).toBe(true);
    expect(identities.find((i) => i.id === "personal")?.isDefault).toBe(false);
    expect(store.loadConfig().defaultIdentityId).toBe("work");
  });

  it("adds and removes directory rules", () => {
    store.addRule({
      id: "work_rule",
      path: "~/Projects/company",
      identityId: "work",
      defaultProvider: "github",
    });

    let rules = store.loadRules();
    expect(rules.length).toBe(1);
    expect(rules[0].id).toBe("work_rule");

    const removed = store.removeRule("work_rule");
    expect(removed).toBe(true);
    rules = store.loadRules();
    expect(rules.length).toBe(0);
  });

  it("adds and manages accounts", () => {
    store.addAccount({
      id: "gh_personal",
      providerId: "github",
      host: "github.com",
      username: "fuad",
      authType: "oauth",
    });

    const accounts = store.loadAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0].username).toBe("fuad");

    store.removeAccount("gh_personal");
    expect(store.loadAccounts().length).toBe(0);
  });
});
