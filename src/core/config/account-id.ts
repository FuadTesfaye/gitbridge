import { hostsEqual } from "@/utils/hosts";
import type { GitProviderType, ProviderAccount } from "./schema";

/**
 * Builds the id for a newly authenticated account.
 *
 * `<provider>_<username>` for the provider's default host, and
 * `<provider>_<username>_<host>` otherwise, so logging in to a GitHub
 * Enterprise or self-hosted GitLab instance with the same username as the
 * public account no longer overwrites it. An account that already exists for
 * the same provider, host and username keeps its current id (ids created by
 * older versions had no host part).
 */
export function buildAccountId(
  provider: GitProviderType,
  username: string,
  host: string,
  defaultHost: string,
  existing: ProviderAccount[]
): string {
  const match = existing.find(
    (a) => a.providerId === provider && hostsEqual(a.host, host) && a.username === username
  );
  if (match) return match.id;

  const safeUser = username.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (hostsEqual(host, defaultHost)) {
    return `${provider}_${safeUser}`;
  }
  const safeHost = host.toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `${provider}_${safeUser}_${safeHost}`;
}
