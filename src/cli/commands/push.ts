import ora from "ora";
import pc from "picocolors";
import { GitCli } from "@/core/git/git-cli";
import { logger } from "@/utils/logger";

export async function handlePushCommand(
  targetRemoteOrProvider?: string,
  options: { all?: boolean; tags?: boolean; force?: boolean } = {}
) {
  const git = new GitCli();
  if (!(await git.isGitRepo())) {
    logger.error("Current directory is not a Git repository.");
    return;
  }

  const currentBranch = await git.getCurrentBranch();
  if (!currentBranch) {
    logger.error("Unable to determine current Git branch (HEAD might be detached).");
    return;
  }

  const remotes = await git.getRemotes();
  if (remotes.length === 0) {
    logger.error("No remotes configured for this repository.");
    return;
  }

  let targets = remotes;
  if (targetRemoteOrProvider && !options.all) {
    targets = remotes.filter(
      (r) =>
        r.name === targetRemoteOrProvider ||
        r.parsedPush?.providerId === targetRemoteOrProvider ||
        r.parsedFetch?.providerId === targetRemoteOrProvider
    );

    if (targets.length === 0) {
      logger.error(`No remote matching '${targetRemoteOrProvider}' found.`);
      return;
    }
  }

  console.log(pc.bold(`\n  Pushing branch '${pc.cyan(currentBranch)}' to ${targets.length} remote(s)...\n`));

  const results = await Promise.allSettled(
    targets.map(async (remote) => {
      const spinner = ora(`Pushing to ${pc.cyan(remote.name)} (${remote.pushUrl})...`).start();
      try {
        const pushArgs = ["push", remote.name, currentBranch];
        if (options.tags) pushArgs.push("--tags");
        if (options.force) pushArgs.push("--force");

        await git.exec(pushArgs);
        spinner.succeed(`Pushed to ${pc.green(remote.name)} [${remote.parsedPush?.providerId.toUpperCase() || "GIT"}]`);
        return { remote: remote.name, success: true };
      } catch (err: unknown) {
        spinner.fail(`Failed push to ${pc.red(remote.name)}: ${err instanceof Error ? err.message : String(err)}`);
        return { remote: remote.name, success: false, error: String(err) };
      }
    })
  );

  const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
  console.log("");
  if (successful === targets.length) {
    logger.success(`All ${successful} remote(s) updated successfully!`);
  } else {
    logger.warn(`Push finished with ${successful}/${targets.length} remotes succeeded.`);
  }
}
