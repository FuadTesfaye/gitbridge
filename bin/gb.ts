#!/usr/bin/env bun
import { createProgram } from "../src/cli";
import { handleGitProxyCommand } from "../src/cli/commands/override";
import { normalizeArgv } from "../src/utils/similarity";

const normalizedArgv = normalizeArgv(process.argv);

if (normalizedArgv[2] === "git-proxy") {
  handleGitProxyCommand(normalizedArgv.slice(3));
} else {
  const program = createProgram("gb");

  if (normalizedArgv.length <= 2) {
    program.outputHelp();
    process.exit(0);
  }

  program.parseAsync(normalizedArgv).catch((err: unknown) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
