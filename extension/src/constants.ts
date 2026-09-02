export const EXTENSION_ID = "gitbridge-vscode";

export const COMMANDS = {
  SWITCH_IDENTITY: "gitbridge.switchIdentity",
  SET_DEFAULT_IDENTITY: "gitbridge.setDefaultIdentity",
  REMOVE_IDENTITY: "gitbridge.removeIdentity",
  INIT_REPO: "gitbridge.initRepo",
  ADD_IDENTITY: "gitbridge.addIdentity",
  ADD_RULE: "gitbridge.addRule",
  REMOVE_RULE: "gitbridge.removeRule",
  OPEN_DIRECTORY_RULE: "gitbridge.openDirectoryRule",
  AUTH_LOGIN: "gitbridge.authLogin",
  AUTH_LOGOUT: "gitbridge.authLogout",
  PUSH_ALL: "gitbridge.pushAll",
  DOCTOR: "gitbridge.doctor",
  ENABLE: "gitbridge.enable",
  DISABLE: "gitbridge.disable",
  REFRESH: "gitbridge.refresh",
  FIX_MISMATCH: "gitbridge.fixMismatch",
  TOGGLE_SAFETY_HOOK: "gitbridge.toggleSafetyHook",
  SHOW_STATUS_BAR_MENU: "gitbridge.showStatusBarMenu",
} as const;

export const VIEWS = {
  CONTEXT: "gitbridge.context",
  IDENTITIES: "gitbridge.identities",
  ACCOUNTS: "gitbridge.accounts",
  RULES: "gitbridge.rules",
  SCM_CONTEXT: "gitbridge.scm.context",
} as const;

export const CONTEXT_KEYS = {
  ENABLED: "gitbridge:enabled",
  IS_GIT_REPO: "gitbridge:isGitRepo",
  HAS_MISMATCH: "gitbridge:hasMismatch",
  HOOK_INSTALLED: "gitbridge:hookInstalled",
} as const;
