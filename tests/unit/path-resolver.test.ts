import { describe, expect, it } from "bun:test";
import path from "node:path";
import { PathResolver } from "@/core/config/path-resolver";

describe("PathResolver", () => {
  it("routes every home-derived path through an explicit home directory", () => {
    const home = path.join("/tmp", "gb-fake-home");
    const paths = new PathResolver(undefined, home);

    expect(paths.hasExplicitHomeDir()).toBe(true);
    expect(paths.getHomeDir()).toBe(home);
    expect(paths.getBaseDir()).toBe(path.join(home, ".gitbridge"));
    expect(paths.getUserGitConfigFile()).toBe(path.join(home, ".gitconfig"));
    expect(paths.getUserSshDir()).toBe(path.join(home, ".ssh"));
    expect(paths.getUserSshConfigFile()).toBe(path.join(home, ".ssh", "config"));
    expect(paths.getUserConfigDir()).toBe(path.join(home, ".config"));
  });

  it("ignores XDG_CONFIG_HOME when an explicit home directory is given", () => {
    const home = path.join("/tmp", "gb-fake-home");
    const paths = new PathResolver(undefined, home);
    // The preload sets XDG_CONFIG_HOME for the whole run; an explicit home must still win.
    expect(process.env.XDG_CONFIG_HOME).toBeDefined();
    expect(paths.getUserConfigDir()).toBe(path.join(home, ".config"));
  });

  it("keeps a custom base dir while sealing the home", () => {
    const home = path.join("/tmp", "gb-fake-home");
    const base = path.join("/tmp", "gb-fake-base");
    const paths = new PathResolver(base, home);
    expect(paths.getBaseDir()).toBe(base);
    expect(paths.getUserGitConfigFile()).toBe(path.join(home, ".gitconfig"));
  });

  it("follows the environment when no home directory is given", () => {
    const paths = new PathResolver();
    expect(paths.hasExplicitHomeDir()).toBe(false);
    expect(paths.getHomeDir()).toBe(process.env.HOME!);
    expect(paths.getUserConfigDir()).toBe(process.env.XDG_CONFIG_HOME!);
    expect(paths.getBaseDir()).toBe(process.env.GITBRIDGE_HOME!);
  });
});
