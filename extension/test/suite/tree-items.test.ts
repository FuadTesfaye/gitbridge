import { describe, expect, it } from "bun:test";
import {
  ContextPropertyItem,
  IdentityTreeItem,
  AccountTreeItem,
  RuleTreeItem,
} from "../../src/providers/tree-items";
import type { GitIdentity, ProviderAccount, DirectoryRule } from "../../../src/core/config/schema";

describe("Extension Tree Items", () => {
  it("renders ContextPropertyItem correctly", () => {
    const item = new ContextPropertyItem("Repository", "my-project", "repo", "Project Root");
    expect(item.label).toBe("Repository");
    expect(item.description).toBe("my-project");
    expect(item.tooltip).toContain("Project Root");
  });

  it("renders IdentityTreeItem with active badge and switch command", () => {
    const identity: GitIdentity = {
      id: "work",
      name: "Fuad Work",
      email: "work@company.com",
      signingKey: null,
      isDefault: false,
      createdAt: new Date().toISOString(),
    };

    const activeItem = new IdentityTreeItem(identity, true);
    expect(activeItem.label).toBe("Fuad Work");
    expect(activeItem.description).toContain("[Active]");
    expect(activeItem.command?.command).toBe("gitbridge.switchIdentity");

    const inactiveItem = new IdentityTreeItem(identity, false);
    expect(inactiveItem.description).toBe("work@company.com");
  });

  it("renders AccountTreeItem with provider icons", () => {
    const ghAccount: ProviderAccount = {
      id: "github_fuad",
      providerId: "github",
      host: "github.com",
      username: "FuadTesfaye",
      authType: "oauth",
      createdAt: new Date().toISOString(),
    };

    const item = new AccountTreeItem(ghAccount);
    expect(item.label).toBe("@FuadTesfaye");
    expect(item.description).toBe("GITHUB (github.com)");
  });

  it("renders RuleTreeItem with directory mapping", () => {
    const rule: DirectoryRule = {
      id: "rule_work",
      path: "~/Projects/work",
      identityId: "work",
    };

    const item = new RuleTreeItem(rule);
    expect(item.label).toBe("~/Projects/work");
    expect(item.description).toBe("➔ work");
  });
});
