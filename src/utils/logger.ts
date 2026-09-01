import pc from "picocolors";

export type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private isDebug = process.env.DEBUG === "true" || process.env.GITBRIDGE_DEBUG === "1";

  setDebug(val: boolean) {
    this.isDebug = val;
  }

  debug(msg: string, ...args: unknown[]) {
    if (this.isDebug) {
      console.log(pc.gray(`[DEBUG] ${msg}`), ...args);
    }
  }

  info(msg: string) {
    console.log(pc.blue("ℹ ") + msg);
  }

  success(msg: string) {
    console.log(pc.green("✔ ") + pc.bold(msg));
  }

  warn(msg: string) {
    console.log(pc.yellow("⚠ ") + pc.yellow(msg));
  }

  error(msg: string, err?: unknown) {
    console.error(pc.red("✖ ") + pc.red(msg));
    if (err && this.isDebug) {
      console.error(err);
    }
  }

  highlight(text: string): string {
    return pc.cyan(text);
  }

  dim(text: string): string {
    return pc.gray(text);
  }

  bold(text: string): string {
    return pc.bold(text);
  }
}

export const logger = new Logger();
