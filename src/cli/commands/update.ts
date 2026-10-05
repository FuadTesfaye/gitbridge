import pc from "picocolors";
import { GITBRIDGE_VERSION } from "@/version";
import { logger } from "@/utils/logger";
import { execProcess } from "@/utils/proc";
import { isHttpsUrl } from "@/utils/hosts";

const PACKAGE_NAME = "@fuad24/gitbridge";
const DEFAULT_REGISTRY = "https://registry.npmjs.org";

/** Strict semver (optional pre-release/build). The only shape ever passed to `npm install`. */
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isValidVersion(value: unknown): value is string {
  return typeof value === "string" && SEMVER_RE.test(value);
}

export function compareVersions(v1: string, v2: string): number {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Asks the registry for the latest version. Returns null when the registry is
 * not HTTPS, the package is unknown, or the response is not a plain semver
 * string: whatever comes back is later interpolated into an `npm install`
 * argument, so it is never trusted blindly.
 */
export async function fetchLatestVersion(
  packageName: string = PACKAGE_NAME,
  registryUrl: string = DEFAULT_REGISTRY
): Promise<string | null> {
  if (!isHttpsUrl(registryUrl)) return null;
  try {
    const url = `${registryUrl.replace(/\/$/, "")}/${packageName}/latest`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return isValidVersion(data.version) ? data.version : null;
  } catch {
    return null;
  }
}

export interface UpdateOptions {
  check?: boolean;
  force?: boolean;
  registry?: string;
}

export async function handleUpdateCommand(opts: UpdateOptions = {}): Promise<void> {
  const packageName = PACKAGE_NAME;
  const registry = opts.registry || DEFAULT_REGISTRY;

  console.log(pc.bold(pc.cyan("\n  GitBridge Update Checker\n")));

  if (!isHttpsUrl(registry)) {
    logger.error(`Refusing to use a non-HTTPS registry: ${registry}`);
    return;
  }

  logger.info(`Checking for updates on ${registry}...`);

  const latestVersion = await fetchLatestVersion(packageName, registry);

  if (!latestVersion) {
    logger.warn(`Could not get a valid latest version from ${registry}.`);
    logger.info(`You can manually update with: npm install -g ${packageName}@latest\n`);
    return;
  }

  const comparison = compareVersions(latestVersion, GITBRIDGE_VERSION);

  if (comparison <= 0 && !opts.force) {
    logger.success(`GitBridge is up to date! (v${GITBRIDGE_VERSION})\n`);
    return;
  }

  if (comparison > 0) {
    console.log(
      `\n  ${pc.bold(pc.yellow("✨ A new version of GitBridge is available!"))}\n` +
      `  Current:  ${pc.gray(`v${GITBRIDGE_VERSION}`)}\n` +
      `  Latest:   ${pc.green(`v${latestVersion}`)}\n`
    );
  } else if (opts.force) {
    console.log(
      `\n  ${pc.bold(pc.yellow(`Reinstalling latest version (v${latestVersion})...`))}\n`
    );
  }

  if (opts.check) {
    console.log(pc.gray(`Run `) + pc.cyan(`gb update`) + pc.gray(` to install the latest version.\n`));
    return;
  }

  // Defensive: fetchLatestVersion already validated this, keep the guard next to the spawn.
  if (!isValidVersion(latestVersion)) {
    logger.error(`Refusing to install an invalid version string: ${latestVersion}`);
    return;
  }

  logger.info(`Installing update via npm...`);

  const installArgs = ["install", "-g", `${packageName}@${latestVersion}`];
  if (opts.registry) {
    installArgs.push("--registry", registry);
  }
  const res = await execProcess("npm", installArgs, { allowFailure: true });

  if (res.exitCode === 0) {
    logger.success(`Successfully updated GitBridge to v${latestVersion}!\n`);
  } else {
    logger.warn(`Global installation returned exit code ${res.exitCode}.`);
    if (res.stderr.includes("EACCES") || res.stderr.includes("permission denied")) {
      console.log(pc.yellow(`\nPermission denied. Please run the update command with administrator privileges:`));
      console.log(pc.cyan(`  sudo npm install -g ${packageName}@${latestVersion}\n`));
    } else {
      if (res.stderr || res.stdout) {
        console.log(pc.gray(`  ${(res.stderr || res.stdout).trim()}`));
      }
      console.log(pc.yellow(`Try manually updating with:`));
      console.log(pc.cyan(`  npm install -g ${packageName}@${latestVersion}\n`));
    }
  }
}
