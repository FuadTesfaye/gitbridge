import Table from "cli-table3";
import pc from "picocolors";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { logger } from "@/utils/logger";

export async function handleProviderList() {
  const providers = defaultProviderRegistry.list();

  console.log(pc.bold("\n  GIT PROVIDERS"));
  console.log("  ──────────────────────────────────────────────────");

  const table = new Table({
    head: [pc.bold("ID"), pc.bold("Name"), pc.bold("Default Host"), pc.bold("Status")],
    style: { head: ["cyan"] },
  });

  for (const p of providers) {
    table.push([pc.cyan(p.id), p.name, p.defaultHost, pc.green("✔ supported")]);
  }

  console.log(table.toString());
  console.log("");
}
