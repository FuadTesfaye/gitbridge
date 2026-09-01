import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

async function runBuild() {
  const outDir = path.resolve(__dirname, "../dist");
  const binOutDir = path.join(outDir, "bin");

  fs.mkdirSync(binOutDir, { recursive: true });

  // 1. Bundle main library
  await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: "dist/index.js",
    sourcemap: true,
    packages: "external",
  });

  // 2. Bundle gitbridge executable
  await build({
    entryPoints: ["bin/gitbridge.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: "dist/bin/gitbridge.js",
    packages: "external",
  });

  // 3. Bundle gb executable
  await build({
    entryPoints: ["bin/gb.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: "dist/bin/gb.js",
    packages: "external",
  });

  // Ensure single valid #!/usr/bin/env node shebang on line 1
  for (const binFile of ["dist/bin/gitbridge.js", "dist/bin/gb.js"]) {
    let content = fs.readFileSync(binFile, "utf-8");
    // Strip any existing shebang lines
    content = content.replace(/^#!.*\r?\n/gm, "");
    // Prepend single Node shebang
    content = `#!/usr/bin/env node\n${content}`;
    fs.writeFileSync(binFile, content, { encoding: "utf-8", mode: 0o755 });
  }

  console.log("✔ Production builds compiled successfully into ./dist");
}

runBuild().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
