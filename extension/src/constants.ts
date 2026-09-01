export const EXTENSION_ID = "gitbridge-vscode";

export const COMMANDS = {
  SWITCH_IDENTITY: "gitbridge.switchIdentity",
  INIT_REPO: "gitbridge.initRepo",
  ADD_IDENTITY: "gitbridge.addIdentity",
  ADD_RULE: "gitbridge.addRule",
  AUTH_LOGIN: "gitbridge.authLogin",
  AUTH_LOGOUT: "gitbridge.authLogout",
  PUSH_ALL: "gitbridge.pushAll",
  DOCTOR: "gitbridge.doctor",
  ENABLE: "gitbridge.enable",
  DISABLE: "gitbridge.disable",
  REFRESH: "gitbridge.refresh",
} as const;

export const VIEWS = {
  CONTEXT: "gitbridge.context",
  IDENTITIES: "gitbridge.identities",
  ACCOUNTS: "gitbridge.accounts",
  RULES: "gitbridge.rules",
} as const;

export const CONTEXT_KEYS = {
  ENABLED: "gitbridge:enabled",
  IS_GIT_REPO: "gitbridge:isGitRepo",
  HAS_MISMATCH: "gitbridge:hasMismatch",
} as const;
