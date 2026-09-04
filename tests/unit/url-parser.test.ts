import { describe, expect, it } from "bun:test";
import { parseRemoteUrl, buildSshUrl, buildHttpsUrl } from "@/core/git/url-parser";

describe("Remote URL Parser", () => {
  it("parses standard GitHub SSH URL", () => {
    const parsed = parseRemoteUrl("git@github.com:fuad/gitbridge.git");
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe("ssh");
    expect(parsed?.providerId).toBe("github");
    expect(parsed?.host).toBe("github.com");
    expect(parsed?.owner).toBe("fuad");
    expect(parsed?.repo).toBe("gitbridge");
    expect(parsed?.fullName).toBe("fuad/gitbridge");
  });

  it("parses GitLab SSH with nested subgroups", () => {
    const parsed = parseRemoteUrl("git@gitlab.com:company/dept/team/project.git");
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe("ssh");
    expect(parsed?.providerId).toBe("gitlab");
    expect(parsed?.host).toBe("gitlab.com");
    expect(parsed?.owner).toBe("company/dept/team");
    expect(parsed?.repo).toBe("project");
    expect(parsed?.fullName).toBe("company/dept/team/project");
  });

  it("parses Bitbucket HTTPS URL", () => {
    const parsed = parseRemoteUrl("https://bitbucket.org/workspace/repo.git");
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe("https");
    expect(parsed?.providerId).toBe("bitbucket");
    expect(parsed?.host).toBe("bitbucket.org");
    expect(parsed?.owner).toBe("workspace");
    expect(parsed?.repo).toBe("repo");
  });

  it("parses SSH URL with GitBridge host alias", () => {
    const parsed = parseRemoteUrl("git@github.com-github_corp:myorg/fleet.git");
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe("ssh");
    expect(parsed?.providerId).toBe("github");
    expect(parsed?.host).toBe("github.com");
    expect(parsed?.accountAlias).toBe("github_corp");
    expect(parsed?.owner).toBe("myorg");
    expect(parsed?.repo).toBe("fleet");
  });

  it("parses self-hosted custom git instance", () => {
    const parsed = parseRemoteUrl("https://git.internal-corp.net/core/backend.git");
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe("https");
    expect(parsed?.providerId).toBe("custom");
    expect(parsed?.host).toBe("git.internal-corp.net");
    expect(parsed?.owner).toBe("core");
    expect(parsed?.repo).toBe("backend");
  });

  it("builds SSH and HTTPS URLs properly", () => {
    expect(buildSshUrl("github.com", "fuad", "gitbridge")).toBe("git@github.com:fuad/gitbridge.git");
    expect(buildSshUrl("github.com", "fuad", "gitbridge", "personal")).toBe("git@github.com-personal:fuad/gitbridge.git");
    expect(buildHttpsUrl("gitlab.com", "corp/sub", "app")).toBe("https://gitlab.com/corp/sub/app.git");
  });

  it("handles gitea and codeberg providers", () => {
    const gitea = parseRemoteUrl("https://gitea.internal.lan/team/proj.git");
    expect(gitea?.providerId).toBe("gitea");

    const codeberg = parseRemoteUrl("git@codeberg.org:org/repo.git");
    expect(codeberg?.providerId).toBe("gitea");
  });

  it("handles short prefix aliases like github-work", () => {
    const parsed = parseRemoteUrl("git@github-work:user/repo.git");
    expect(parsed?.host).toBe("github.com");
    expect(parsed?.accountAlias).toBe("work");

    const bb = parseRemoteUrl("git@bitbucket-team:user/repo.git");
    expect(bb?.host).toBe("bitbucket.org");
    expect(bb?.accountAlias).toBe("team");
  });

  it("handles ssh://, git+ssh://, file://, and invalid URLs", () => {
    const sshProto = parseRemoteUrl("ssh://git@github.com/org/repo.git");
    expect(sshProto?.protocol).toBe("ssh");

    const gitSsh = parseRemoteUrl("git+ssh://gitlab.com/org/repo.git");
    expect(gitSsh?.protocol).toBe("ssh");

    const fileProto = parseRemoteUrl("file:///local/repos/my-repo.git");
    expect(fileProto?.protocol).toBe("file");

    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl("not-a-valid-url-format")).toBeNull();
  });
});
