import { IdentityGuard } from "@/core/safety/identity-guard";
import { defaultConfigStore } from "@/core/config/config-store";
import { logger } from "@/utils/logger";
import pc from "picocolors";

export async function handleHookCommand(hookType: string) {
  if (hookType !== "pre-commit") {
    return;
  }

  const guard = new IdentityGuard(defaultConfigStore);
  const result = await guard.check();

  if (!result.allowed) {
    console.error(pc.red("\n✖ [GitBridge Identity Guard] Commit Blocked!"));
    console.error(pc.yellow(`  ${result.message}`));
    console.error(
      pc.gray("  To fix this commit identity, run: ") +
        pc.cyan(`git config user.email "${result.expectedEmail}"`)
    );
    console.error(
      pc.gray("  Or update your GitBridge profile with: ") + pc.cyan("gitbridge repo init\n")
    );
    process.exit(1);
  }
}
