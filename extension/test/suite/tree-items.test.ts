import { describe, expect, it } from "bun:test";
import {
  ContextPropertyItem,
  IdentityTreeItem,
  AccountTreeItem,
  RuleTreeItem,
  EmptyStateItem,
} from "../../src/providers/tree-items";
import type { GitIdentity, ProviderAccount, DirectoryRule } from "../../../src/core/config/schema";

describe("Extension Tree Items", () => {
  it("renders ContextPropertyItem correctly", () => {
    const item = new ContextPropertyItem("Repository", "my-project", "repo", {
      description: "Project Root",
      tooltip: "Full Path: /workspace/my-project",
    });
    expect(item.label).toBe("Repository");
    expect(item.description).toBe("my-project");
    expect(item.tooltip).toBe("Full Path: /workspace/my-project");
  });

  it("renders EmptyStateItem with command", () => {
    const item = new EmptyStateItem("No identities", "Add (+)", "gitbridge.addIdentity");
    expect(item.label).toBe("No identities");
    expect(item.description).toBe("Add (+)");
    expect(item.command?.command).toBe("gitbridge.addIdentity");
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

  it("renders AccountTreeItem with provider icons and host alias tooltip", () => {
    const ghAccount: ProviderAccount = {
      id: "github_fuad",
      providerId: "github",
      host: "github.com",
      username: "FuadTesfaye",
      authType: "oauth",
      sshKeyPath: "~/.ssh/id_ed25519",
      createdAt: new Date().toISOString(),
    };

    const item = new AccountTreeItem(ghAccount);
    expect(item.label).toBe("@FuadTesfaye");
    expect(item.description).toBe("GITHUB (github.com)");
    expect(item.tooltip).toContain("SSH Host Alias: github.com-github_fuad");
  });

  it("renders RuleTreeItem with directory mapping", () => {
    const rule: DirectoryRule = {
      id: "rule_work",
      path: "/home/fuaf24/Personal/Gitbridge",
      identityId: "work",
    };

    const item = new RuleTreeItem(rule);
    expect(item.label).toBe("~/Personal/Gitbridge");
    expect(item.description).toBe("➔ work");
    expect(item.command?.command).toBe("gitbridge.openDirectoryRule");
  });
});
