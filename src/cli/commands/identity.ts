import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitConfigGenerator } from "@/core/git/config-generator";
import { renderIdentitiesTable } from "../ui/tables";
import { promptText, promptConfirm } from "../ui/prompts";
import { logger } from "@/utils/logger";
import pc from "picocolors";

export async function handleIdentityList(store: ConfigStore = defaultConfigStore) {
  const identities = store.loadIdentities();
  const config = store.loadConfig();

  console.log(pc.bold("\n  GIT IDENTITIES"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(renderIdentitiesTable(identities, config.defaultIdentityId));
}

export async function handleIdentityAdd(
  options: { id?: string; name?: string; email?: string; signingKey?: string; default?: boolean } = {},
  store: ConfigStore = defaultConfigStore
) {
  const isInteractive = !options.id && !options.name && !options.email;

  let id = options.id;
  let name = options.name;
  let email = options.email;
  let signingKey = options.signingKey || null;
  let isDefault = options.default;

  if (!id) {
    id = await promptText({
      message: "Enter an identity ID (e.g. personal, work, client-acme):",
      validate: (val) => {
        if (!val || !val.trim()) return "Identity ID is required.";
        if (store.getIdentity(val.trim())) return "An identity with this ID already exists.";
        return undefined;
      },
    });
  }

  if (!name) {
    name = await promptText({
      message: "Enter full name for Git commits (e.g. Fuad Tesfaye):",
      validate: (val) => (!val || !val.trim() ? "Name is required." : undefined),
    });
  }

  if (!email) {
    email = await promptText({
      message: "Enter email address for Git commits:",
      validate: (val) => (!val || !val.includes("@") ? "Please enter a valid email address." : undefined),
    });
  }

  if (isInteractive && signingKey === null) {
    const addKey = await promptConfirm({
      message: "Do you want to configure an SSH or GPG commit signing key for this identity?",
      initialValue: false,
    });
    if (addKey) {
      signingKey = await promptText({
        message: "Enter signing key (SSH public key or GPG Key ID):",
      });
    }
  }

  if (isDefault === undefined) {
    const existing = store.loadIdentities();
    if (existing.length === 0) {
      isDefault = true;
    } else if (isInteractive) {
      isDefault = await promptConfirm({
        message: "Set this identity as your global default identity?",
        initialValue: false,
      });
    } else {
      isDefault = false;
    }
  }

  const created = store.addIdentity({
    id: id.trim(),
    name: name.trim(),
    email: email.trim(),
    signingKey: signingKey ? signingKey.trim() : null,
    isDefault,
  });

  // Regenerate config
  const generator = new GitConfigGenerator(store);
  generator.generate();

  logger.success(`Identity '${created.id}' created successfully!`);
  console.log(pc.gray(`  Name:  ${created.name}`));
  console.log(pc.gray(`  Email: ${created.email}`));
  if (created.isDefault) {
    console.log(pc.green("  Set as global default identity."));
  }
  console.log("");
}

export async function handleIdentityUse(id: string, store: ConfigStore = defaultConfigStore) {
  const target = store.getIdentity(id);
  if (!target) {
    logger.error(`Identity with ID '${id}' does not exist.`);
    return;
  }

  store.setDefaultIdentity(id);

  const generator = new GitConfigGenerator(store);
  generator.generate();

  logger.success(`Switched global default Git identity to '${target.id}' (${target.email})`);
}

export async function handleIdentityRemove(id: string, store: ConfigStore = defaultConfigStore) {
  const removed = store.removeIdentity(id);
  if (!removed) {
    logger.error(`Identity with ID '${id}' not found.`);
    return;
  }

  const generator = new GitConfigGenerator(store);
  generator.generate();

  logger.success(`Removed identity '${id}'.`);
}
