import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { IdentityResolver } from "@/core/identity/identity-resolver";

export async function handleEnvCommand(store: ConfigStore = defaultConfigStore) {
  const resolver = new IdentityResolver(store);
  const ctx = await resolver.resolve();

  if (ctx.identity) {
    console.log(`export GIT_AUTHOR_NAME="${ctx.identity.name}"`);
    console.log(`export GIT_AUTHOR_EMAIL="${ctx.identity.email}"`);
    console.log(`export GIT_COMMITTER_NAME="${ctx.identity.name}"`);
    console.log(`export GIT_COMMITTER_EMAIL="${ctx.identity.email}"`);
  }

  if (ctx.account?.sshKeyPath) {
    console.log(`export GIT_SSH_COMMAND="ssh -i \\"${ctx.account.sshKeyPath}\\" -o IdentitiesOnly=yes"`);
  }
}
