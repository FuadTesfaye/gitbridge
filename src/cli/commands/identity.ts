import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitConfigGenerator } from "@/core/git/config-generator";
import { renderIdentitiesTable } from "../ui/tables";
import { promptText, promptConfirm, promptSelect } from "../ui/prompts";
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

export async function handleIdentityEdit(
  idArg?: string,
  options: { name?: string; email?: string; signingKey?: string; default?: boolean } = {},
  store: ConfigStore = defaultConfigStore
) {
  let id = idArg;
  const identities = store.loadIdentities();
  if (identities.length === 0) {
    logger.warn("No identities configured. Run 'gitbridge identity add' first.");
    return;
  }

  if (!id) {
    id = await promptSelect({
      message: "Select identity to edit:",
      options: identities.map((i) => ({
        value: i.id,
        label: `${i.id} (${i.name} <${i.email}>)`,
        hint: i.isDefault ? "default" : undefined,
      })),
    });
  }

  const existing = store.getIdentity(id);
  if (!existing) {
    logger.error(`Identity with ID '${id}' not found.`);
    return;
  }

  const isInteractive =
    !options.name && !options.email && options.signingKey === undefined && options.default === undefined;

  let newName = options.name;
  let newEmail = options.email;
  let newSigningKey: string | null | undefined = options.signingKey;
  let newDefault = options.default;

  if (isInteractive) {
    newName = await promptText({
      message: "Full name for Git commits:",
      defaultValue: existing.name,
      validate: (val) => (!val || !val.trim() ? "Name cannot be empty." : undefined),
    });

    newEmail = await promptText({
      message: "Email address for Git commits:",
      defaultValue: existing.email,
      validate: (val) => (!val || !val.includes("@") ? "Please enter a valid email address." : undefined),
    });

    const editKey = await promptConfirm({
      message: `Configure commit signing key? (Current: ${existing.signingKey || "none"})`,
      initialValue: !!existing.signingKey,
    });

    if (editKey) {
      newSigningKey = await promptText({
        message: "Signing key (SSH public key or GPG Key ID):",
        defaultValue: existing.signingKey || "",
      });
    } else {
      newSigningKey = null;
    }

    newDefault = await promptConfirm({
      message: "Set as global default identity?",
      initialValue: existing.isDefault,
    });
  }

  const updated = store.updateIdentity(id, {
    name: newName !== undefined ? newName.trim() : existing.name,
    email: newEmail !== undefined ? newEmail.trim() : existing.email,
    signingKey: newSigningKey !== undefined ? (newSigningKey ? newSigningKey.trim() : null) : existing.signingKey,
    isDefault: newDefault !== undefined ? newDefault : existing.isDefault,
  });

  const generator = new GitConfigGenerator(store);
  generator.generate();

  logger.success(`Identity '${updated.id}' updated successfully!`);
  console.log(pc.gray(`  Name:  ${updated.name}`));
  console.log(pc.gray(`  Email: ${updated.email}`));
  if (updated.isDefault) {
    console.log(pc.green("  Active global default identity."));
  }
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

