import { IdentityGuard } from "@/core/safety/identity-guard";
import { defaultConfigStore } from "@/core/config/config-store";
import pc from "picocolors";

export async function handleHookCommand(hookType: string) {
  const guard = new IdentityGuard(defaultConfigStore);

  if (hookType === "pre-commit") {
    const result = await guard.check(process.cwd(), "commit");

    if (!result.allowed) {
      console.error(pc.bold(pc.red("\n✖ [GitBridge Safety Guard] Commit Blocked!")));

      if (result.violations && result.violations.length > 0) {
        console.error(pc.yellow(`  ⚠ Accidental secrets or private keys detected in staged changes:`));
        for (const v of result.violations) {
          console.error(`    ${pc.bold(v.file)}:`);
          for (const s of v.secrets) {
            const loc = s.line ? `Line ${s.line}: ` : "";
            console.error(`      • ${pc.red(s.description)} (${loc}${pc.gray(s.matchSnippet)})`);
          }
        }
        console.error(
          pc.gray("\n  Action required: ") +
            "Please unstage or remove the sensitive credentials before committing."
        );
        console.error(
          pc.gray("  To bypass this check in an emergency, use: ") + pc.cyan("git commit --no-verify\n")
        );
      } else {
        console.error(pc.yellow(`  ${result.message}`));
        console.error(
          pc.gray("  To fix this commit identity, run: ") +
            pc.cyan(`git config user.email "${result.expectedEmail}"`)
        );
        console.error(
          pc.gray("  Or update your GitBridge profile with: ") + pc.cyan("gitbridge repo init\n")
        );
      }

      process.exit(1);
    }
  } else if (hookType === "pre-push") {
    const result = await guard.check(process.cwd(), "push");

    if (!result.allowed) {
      console.error(pc.bold(pc.red("\n✖ [GitBridge Push Guard] Push Blocked!")));
      console.error(pc.yellow(`  ${result.message}`));

      if (result.remoteViolations && result.remoteViolations.length > 0) {
        console.error(pc.yellow(`  ⚠ Found plaintext credentials embedded in Git remote URLs:`));
        for (const rv of result.remoteViolations) {
          console.error(`    • Remote '${pc.cyan(rv.name)}': ${pc.gray(rv.url)}`);
        }
        console.error(
          pc.gray("\n  Remediation: ") +
            `Run '${pc.cyan("gb security fix")}' to scrub credentials into the secure OS Keyring.\n`
        );
      }

      process.exit(1);
    }
  }
}
