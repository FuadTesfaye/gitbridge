#!/usr/bin/env bun
import { createProgram } from "../src/cli";
import { handleGitProxyCommand } from "../src/cli/commands/override";

if (process.argv[2] === "git-proxy") {
  handleGitProxyCommand(process.argv.slice(3));
} else {
  const program = createProgram("gb");

  if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
  }

  program.parseAsync(process.argv).catch((err: unknown) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
