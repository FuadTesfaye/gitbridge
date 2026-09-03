export function handleCompletionCommand(shell = "bash") {
  const targetShell = shell.toLowerCase();

  if (targetShell === "zsh") {
    console.log(`#compdef gitbridge gb

_gitbridge() {
  local -a commands
  commands=(
    'setup:Interactive onboarding wizard'
    'status:Display configured identities, accounts and rules'
    'context:Inspect Git and GitBridge identity context'
    'current:Print current author identity or prompt badge'
    'explain:Decision tree diagnostics explaining why an identity was selected'
    'env:Print shell environment exports for current repo'
    'switch:Switch active Git identity'
    'clone:Smart clone with provider, account, and identity setup'
    'init:Initialize GitBridge profile in current repo'
    'doctor:Run system diagnostics'
    'enable:Enable GitBridge in ~/.gitconfig and ~/.ssh/config'
    'disable:Disable GitBridge integration'
    'identity:Manage commit identities'
    'account:Manage provider accounts'
    'provider:Manage Git providers'
    'auth:Authenticate with Git providers'
    'rule:Manage directory routing rules'
    'ssh:Manage SSH keys and account associations'
    'override:Manage native Git command override'
    'ide:Sync IDE configurations'
  )

  _arguments -C \\
    '1: :->command' \\
    '*:: :->args'

  case $state in
    command)
      _describe -t commands 'gitbridge commands' commands
      ;;
  esac
}

compdef _gitbridge gitbridge
compdef _gitbridge gb
`);
    return;
  }

  if (targetShell === "fish") {
    console.log(`# GitBridge fish completion
function __fish_gitbridge_needs_command
  set cmd (commandline -opc)
  if [ (count $cmd) -eq 1 ]
    return 0
  end
  return 1
end

complete -f -c gitbridge -n '__fish_gitbridge_needs_command' -a 'setup status context current explain env switch clone init doctor enable disable identity account provider auth rule ssh override ide'
complete -f -c gb -n '__fish_gitbridge_needs_command' -a 'setup st ctx current explain env sw clone init doc enable disable id acc prov auth rules ssh override ide'
`);
    return;
  }

  // Default: Bash completion
  console.log(`#!/usr/bin/env bash
# GitBridge bash completion

_gitbridge_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  opts="setup status st context ctx current explain env switch sw clone init doctor doc enable disable identity id account acc provider prov auth rule rules ssh remote rem push override ide completion"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
    return 0
  fi

  case "\${prev}" in
    switch|sw)
      # Complete with identities if gitbridge is available
      local ids=$(gitbridge identity list 2>/dev/null | grep -E '^[│|][[:space:]]*[a-zA-Z0-9_-]+' | awk '{print $2}')
      COMPREPLY=( $(compgen -W "\${ids}" -- "\${cur}") )
      return 0
      ;;
    provider|prov)
      COMPREPLY=( $(compgen -W "list ls enable disable add" -- "\${cur}") )
      return 0
      ;;
    auth)
      COMPREPLY=( $(compgen -W "login logout" -- "\${cur}") )
      return 0
      ;;
    ssh)
      COMPREPLY=( $(compgen -W "list ls generate gen link" -- "\${cur}") )
      return 0
      ;;
  esac
}

complete -F _gitbridge_completions gitbridge
complete -F _gitbridge_completions gb
`);
}
