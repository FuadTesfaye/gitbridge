import pc from "picocolors";

export function showBanner(): void {
  console.log(
    pc.cyan(`
  ┌──────────────────────────────────────────────────┐
  │                   ${pc.bold("GitBridge")}                      │
  │   Universal Git Identity & Multi-Account Layer   │
  └──────────────────────────────────────────────────┘
    `)
  );
}

export function formatBadge(text: string, color: "green" | "blue" | "yellow" | "red" | "magenta" | "cyan" = "blue"): string {
  switch (color) {
    case "green":
      return pc.bgGreen(pc.black(` ${text} `));
    case "blue":
      return pc.bgBlue(pc.white(` ${text} `));
    case "yellow":
      return pc.bgYellow(pc.black(` ${text} `));
    case "red":
      return pc.bgRed(pc.white(` ${text} `));
    case "magenta":
      return pc.bgMagenta(pc.white(` ${text} `));
    case "cyan":
      return pc.bgCyan(pc.black(` ${text} `));
  }
}
