export class GitBridgeError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "GitBridgeError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigError extends GitBridgeError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class AuthError extends GitBridgeError {
  constructor(message: string) {
    super(message, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

export class ProviderError extends GitBridgeError {
  constructor(message: string, public readonly provider: string) {
    super(`[${provider}] ${message}`, "PROVIDER_ERROR");
    this.name = "ProviderError";
  }
}

export class GitCliError extends GitBridgeError {
  constructor(message: string, public readonly exitCode: number, public readonly stderr: string) {
    super(`Git error (${exitCode}): ${message}`, "GIT_CLI_ERROR");
    this.name = "GitCliError";
  }
}

export class CredentialStoreError extends GitBridgeError {
  constructor(message: string) {
    super(message, "CREDENTIAL_STORE_ERROR");
    this.name = "CredentialStoreError";
  }
}
