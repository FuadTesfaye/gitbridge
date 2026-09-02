import { spawn } from "node:child_process";

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  allowFailure?: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Cross-runtime process runner that works identically on Node.js and Bun.
 */
export function execProcess(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    if (options.stdin !== undefined) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    proc.on("error", (err) => {
      reject(err);
    });

    proc.on("close", (code) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0 && !options.allowFailure) {
        const msg = stderr.trim() || stdout.trim() || `${command} ${args.join(" ")} failed with code ${exitCode}`;
        const err = new Error(msg) as any;
        err.exitCode = exitCode;
        err.stderr = stderr.trim();
        err.stdout = stdout.trim();
        reject(err);
      } else {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
        });
      }
    });
  });
}

/**
 * Cross-runtime stdin reader for Node.js and Bun.
 */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }

    let data = "";
    process.stdin.setEncoding("utf-8");

    process.stdin.on("data", (chunk) => {
      data += chunk;
    });

    process.stdin.on("end", () => {
      resolve(data);
    });

    process.stdin.on("error", () => {
      resolve(data);
    });

    process.stdin.resume();
  });
}
