import pc from "picocolors";
import { GITBRIDGE_VERSION } from "@/version";

function hexToRgb(hex: string): [number, number, number] {
  const bigint = parseInt(hex.replace("#", ""), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function interpolateRgb(rgb1: [number, number, number], rgb2: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.round(rgb1[0] + factor * (rgb2[0] - rgb1[0])),
    Math.round(rgb1[1] + factor * (rgb2[1] - rgb1[1])),
    Math.round(rgb1[2] + factor * (rgb2[2] - rgb1[2])),
  ];
}

function multiGradient(colors: string[], factor: number): [number, number, number] {
  if (factor <= 0) return hexToRgb(colors[0]);
  if (factor >= 1) return hexToRgb(colors[colors.length - 1]);
  const segment = 1 / (colors.length - 1);
  const index = Math.min(Math.floor(factor / segment), colors.length - 2);
  const localFactor = (factor - index * segment) / segment;
  return interpolateRgb(hexToRgb(colors[index]), hexToRgb(colors[index + 1]), localFactor);
}

const ASCII_LOGO_LINES = [
  "   ____ _ _   ____       _     _            ",
  "  / ___(_) |_| __ ) _ __(_) __| | __ _  ___ ",
  " | |  _| | __|  _ \\| '__| |/ _` |/ _` |/ _ \\",
  " | |_| | | |_| |_) | |  | | (_| | (_| |  __/",
  "  \\____|_|\\__|____/|_|  |_|\\__,_|\\__, |\\___|",
  "                                 |___/      ",
];

const NEON_PALETTE = ["#00F5D4", "#00B4D8", "#7B2CBF"];

export function renderBanner(version: string = GITBRIDGE_VERSION): string {
  const isColor = pc.isColorSupported && !process.env.NO_COLOR;
  const maxLen = Math.max(...ASCII_LOGO_LINES.map((l) => l.length));

  let logoStr: string;
  if (isColor) {
    logoStr = ASCII_LOGO_LINES.map((line) => {
      let colored = "";
      for (let i = 0; i < line.length; i++) {
        const factor = maxLen > 1 ? i / (maxLen - 1) : 0;
        const [r, g, b] = multiGradient(NEON_PALETTE, factor);
        colored += `\x1b[38;2;${r};${g};${b}m${line[i]}\x1b[0m`;
      }
      return colored;
    }).join("\n");
  } else {
    logoStr = ASCII_LOGO_LINES.join("\n");
  }

  const subtitle = isColor
    ? `  ${pc.bold(pc.white("GitBridge"))} ${pc.magenta(`v${version}`)} ${pc.gray("•")} ${pc.cyan("Universal Git Identity & Multi-Account Layer")}`
    : `  GitBridge v${version} • Universal Git Identity & Multi-Account Layer`;

  return `\n${logoStr}\n${subtitle}\n`;
}

export function showBanner(version: string = GITBRIDGE_VERSION): void {
  console.log(renderBanner(version));
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

