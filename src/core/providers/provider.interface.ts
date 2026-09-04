import type { GitProviderType } from "../config/schema";

export interface ProviderUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface RemoteRepository {
  id: string;
  name: string;
  fullName: string;
  sshUrl: string;
  httpsUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
  htmlUrl?: string;
}

export interface CreateRepositoryOptions {
  name: string;
  description?: string;
  isPrivate: boolean;
  org?: string;
}

export interface HealthCheckResult {
  apiOk: boolean;
  pingMs: number;
  message?: string;
  error?: string;
}

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface ProviderCapabilities {
  oauth: boolean;
  deviceCode: boolean;
  tokenAuth: boolean;
  passwordAuth: boolean;
  sshKeys: boolean;
  selfHosted: boolean;
}

export type ProviderStatus = "available" | "enabled" | "configured" | "authenticated";

export interface ProviderInstallationState {
  providerId: GitProviderType;
  name: string;
  defaultHost: string;
  status: ProviderStatus;
  enabled: boolean;
  configured: boolean;
  accountCount: number;
  capabilities: ProviderCapabilities;
}

export interface RepoAccessCheckResult {
  hasAccess: boolean;
  permission?: "read" | "write" | "admin";
  owner?: string;
  repo?: string;
}

export interface GitProvider {
  readonly id: GitProviderType;
  readonly name: string;
  readonly defaultHost: string;
  readonly capabilities: ProviderCapabilities;

  validateToken(token: string, host?: string): Promise<boolean>;
  getUser(token: string, host?: string): Promise<ProviderUser>;
  listRepositories(token: string, host?: string): Promise<RemoteRepository[]>;
  checkHealth(host?: string): Promise<HealthCheckResult>;
  
  // Optional remote access checking
  checkRepoAccess?(
    token: string,
    owner: string,
    repo: string,
    host?: string
  ): Promise<RepoAccessCheckResult>;

  // Optional Device Flow for GitHub / OAuth
  startDeviceFlow?(): Promise<DeviceCodeResponse>;
  pollDeviceFlow?(deviceCode: string, interval: number): Promise<{ token: string }>;
}

