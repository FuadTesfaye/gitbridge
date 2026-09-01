#!/usr/bin/env bun
import { createProgram } from "../src/cli";

const program = createProgram();

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
