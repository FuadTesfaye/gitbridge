import os from "node:os";
import path from "node:path";

export type SupportedPlatform = "linux" | "darwin" | "win32" | "unknown";

export function getPlatform(): SupportedPlatform {
  const p = process.platform;
  if (p === "linux" || p === "darwin" || p === "win32") {
    return p;
  }
  return "unknown";
}

export function isLinux(): boolean {
  return getPlatform() === "linux";
}

export function isMacOS(): boolean {
  return getPlatform() === "darwin";
}

export function isWindows(): boolean {
  return getPlatform() === "win32";
}

export function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

export function expandTilde(filepath: string): string {
  if (!filepath) return filepath;
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(getHomeDir(), filepath.slice(1));
  }
  return filepath;
}

export function collapseTilde(filepath: string): string {
  if (!filepath) return filepath;
  const home = getHomeDir();
  if (filepath === home) return "~";
  if (filepath.startsWith(home + path.sep)) {
    return `~${filepath.slice(home.length)}`;
  }
  return filepath;
}
