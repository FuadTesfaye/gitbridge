import { z } from "zod";

// Provider IDs
export const GitProviderTypeSchema = z.enum(["github", "gitlab", "bitbucket", "gitea", "custom"]);
export type GitProviderType = z.infer<typeof GitProviderTypeSchema>;

// Auth Type
export const AuthTypeSchema = z.enum(["oauth", "pat", "ssh", "password"]);
export type AuthType = z.infer<typeof AuthTypeSchema>;

// Git Identity
export const GitIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  signingKey: z.string().nullable().optional().default(null),
  isDefault: z.boolean().optional().default(false),
  defaults: z
    .object({
      provider: GitProviderTypeSchema.optional(),
      account: z.string().optional(),
    })
    .optional(),
  ssh: z
    .object({
      keyPath: z.string().optional(),
      hostAlias: z.string().optional(),
    })
    .optional(),
  createdAt: z.string().datetime().optional().default(() => new Date().toISOString()),
});
export type GitIdentity = z.infer<typeof GitIdentitySchema>;

export const IdentitiesFileSchema = z.object({
  identities: z.array(GitIdentitySchema).default([]),
});
export type IdentitiesFile = z.infer<typeof IdentitiesFileSchema>;

// Provider Account
export const ProviderAccountSchema = z.object({
  id: z.string().min(1),
  providerId: GitProviderTypeSchema,
  host: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().optional(),
  authType: AuthTypeSchema,
  sshKeyPath: z.string().optional(),
  sshPort: z.number().optional(),
  createdAt: z.string().datetime().optional().default(() => new Date().toISOString()),
});
export type ProviderAccount = z.infer<typeof ProviderAccountSchema>;

export const AccountsFileSchema = z.object({
  accounts: z.array(ProviderAccountSchema).default([]),
});
export type AccountsFile = z.infer<typeof AccountsFileSchema>;

// Directory Routing Rule
export const DirectoryRuleSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  identityId: z.string().min(1),
  defaultProvider: GitProviderTypeSchema.optional(),
  defaultAccountId: z.string().optional(),
});
export type DirectoryRule = z.infer<typeof DirectoryRuleSchema>;

// Global Settings
export const GitBridgeSettingsSchema = z.object({
  autoSyncGitConfig: z.boolean().default(true),
  credentialHelperEnabled: z.boolean().default(true),
  sshManagementEnabled: z.boolean().default(true),
  commitIdentitySafety: z.boolean().default(true),
  fallbackEncryptedStore: z.boolean().default(false),
  overrideEnabled: z.boolean().default(false),
  realGitPath: z.string().optional(),
});
export type GitBridgeSettings = z.infer<typeof GitBridgeSettingsSchema>;

// Provider Configuration
export const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultAccount: z.string().optional(),
  customHost: z.string().optional(),
  type: GitProviderTypeSchema.optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Custom Provider definition
export const CustomProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  host: z.string().min(1),
  type: GitProviderTypeSchema.default("custom"),
  apiBaseUrl: z.string().url().optional(),
});
export type CustomProvider = z.infer<typeof CustomProviderSchema>;

// Main Configuration
export const MainConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().default("1.0.0"),
  enabled: z.boolean().default(true),
  defaultIdentityId: z.string().nullable().optional().default(null),
  defaultProvider: GitProviderTypeSchema.optional(),
  providers: z
    .record(z.string(), ProviderConfigSchema)
    .default({ github: { enabled: true } }),
  customProviders: z.array(CustomProviderSchema).default([]),
  rules: z.array(DirectoryRuleSchema).default([]),
  settings: GitBridgeSettingsSchema.default({}),
});
export type MainConfig = z.infer<typeof MainConfigSchema>;

// Repository Remote
export const RepositoryRemoteSchema = z.object({
  name: z.string().min(1),
  providerId: GitProviderTypeSchema,
  host: z.string().min(1),
  accountId: z.string().optional(),
  url: z.string().min(1),
  rawUrl: z.string().optional(),
});
export type RepositoryRemote = z.infer<typeof RepositoryRemoteSchema>;

// Repository Profile
export const RepositoryProfileSchema = z.object({
  path: z.string().min(1),
  identityId: z.string().optional(),
  remotes: z.array(RepositoryRemoteSchema).default([]),
  safetyHookInstalled: z.boolean().optional().default(false),
  updatedAt: z.string().datetime().optional().default(() => new Date().toISOString()),
});
export type RepositoryProfile = z.infer<typeof RepositoryProfileSchema>;

export const RepositoriesFileSchema = z.object({
  repositories: z.array(RepositoryProfileSchema).default([]),
});
export type RepositoriesFile = z.infer<typeof RepositoriesFileSchema>;

// Local Repository Override (.git/gitbridge.json)
export const LocalRepoConfigSchema = z.object({
  profile: z.string().optional(),
  identityId: z.string().optional(),
  providerId: GitProviderTypeSchema.optional(),
  accountId: z.string().optional(),
});
export type LocalRepoConfig = z.infer<typeof LocalRepoConfigSchema>;

