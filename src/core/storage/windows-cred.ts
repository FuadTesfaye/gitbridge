import type { CredentialStore, CredentialWriteResult } from "./credential-store";
import { CredentialStoreError } from "@/utils/errors";
import { execProcess } from "@/utils/proc";

/**
 * Windows Credential Manager via CredWrite/CredRead (advapi32).
 * The secret is passed on stdin as JSON — never on the process command line.
 */
export class WindowsCredentialStore implements CredentialStore {
  readonly name = "Windows Credential Manager";

  async isAvailable(): Promise<boolean> {
    return process.platform === "win32";
  }

  private targetName(service: string, account: string): string {
    const safeService = service.replace(/[^a-zA-Z0-9._-]/g, "");
    const safeAccount = account.replace(/[^a-zA-Z0-9._-]/g, "");
    return `gitbridge:${safeService}:${safeAccount}`;
  }

  private powershellScript(): string {
    return `
$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
$req = $raw | ConvertFrom-Json
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class GbCred {
  public const uint CRED_TYPE_GENERIC = 1;
  public const uint CRED_PERSIST_LOCAL_MACHINE = 2;
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite(ref CREDENTIAL credential, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credentialPtr);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, uint type, uint flags);
}
"@
switch ($req.action) {
  'set' {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$req.secret)
    $blob = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
    $cred = New-Object GbCred+CREDENTIAL
    $cred.Type = [GbCred]::CRED_TYPE_GENERIC
    $cred.TargetName = [string]$req.target
    $cred.UserName = [string]$req.user
    $cred.CredentialBlobSize = $bytes.Length
    $cred.CredentialBlob = $blob
    $cred.Persist = [GbCred]::CRED_PERSIST_LOCAL_MACHINE
    $ok = [GbCred]::CredWrite([ref]$cred, 0)
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($blob)
    if (-not $ok) { exit 1 }
  }
  'get' {
    $ptr = [IntPtr]::Zero
    $ok = [GbCred]::CredRead([string]$req.target, [GbCred]::CRED_TYPE_GENERIC, 0, [ref]$ptr)
    if (-not $ok) { exit 2 }
    $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][GbCred+CREDENTIAL])
    $len = [int]$cred.CredentialBlobSize
    if ($len -gt 0) {
      $bytes = New-Object byte[] $len
      [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $len)
      [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($bytes))
    }
    [GbCred]::CredFree($ptr)
  }
  'delete' {
    [GbCred]::CredDelete([string]$req.target, [GbCred]::CRED_TYPE_GENERIC, 0) | Out-Null
  }
}
`.trim();
  }

  private async run(payload: Record<string, string>, allowFailure = false) {
    const encodedCmd = Buffer.from(this.powershellScript(), "utf16le").toString("base64");
    return execProcess(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCmd],
      { stdin: JSON.stringify(payload), allowFailure }
    );
  }

  async set(service: string, account: string, secret: string): Promise<CredentialWriteResult> {
    const target = this.targetName(service, account);
    const safeAccount = account.replace(/[^a-zA-Z0-9._-]/g, "");
    try {
      const res = await this.run({ action: "set", target, user: safeAccount, secret });
      if (res.exitCode !== 0) {
        throw new Error(res.stderr || "CredWrite failed");
      }
      return { backend: this.name, usedFallback: false };
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to store credential in Windows Credential Manager: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    const target = this.targetName(service, account);
    try {
      const res = await this.run({ action: "get", target, user: "", secret: "" }, true);
      if (res.exitCode === 0 && res.stdout.length > 0) {
        return res.stdout;
      }
      return null;
    } catch {
      return null;
    }
  }

  async delete(service: string, account: string): Promise<void> {
    const target = this.targetName(service, account);
    try {
      await this.run({ action: "delete", target, user: "", secret: "" }, true);
    } catch {
      // ignore
    }
  }
}
