import { describe, expect, it } from "bun:test";
import { LinuxKeyringCredentialStore } from "@/core/storage/linux-keyring";
import { MacOSKeychainCredentialStore } from "@/core/storage/macos-keychain";
import { WindowsCredentialStore } from "@/core/storage/windows-cred";
import { StoreFactory } from "@/core/storage/store-factory";
import { EncryptedVaultCredentialStore } from "@/core/storage/encrypted-vault";
import { PathResolver } from "@/core/config/path-resolver";
import path from "node:path";
import os from "node:os";

describe("Keyring Stores Unit Tests", () => {
  const tempDir = path.join(os.tmpdir(), `gb-keyring-test-${Date.now()}`);
  const paths = new PathResolver(tempDir);

  it("LinuxKeyringCredentialStore reports name and handles operations gracefully", async () => {
    const store = new LinuxKeyringCredentialStore();
    expect(store.name).toContain("Linux");

    const available = await store.isAvailable();
    expect(typeof available).toBe("boolean");

    const val = await store.get("test_service", "test_acc");
    expect(val).toBeNull();

    await store.delete("test_service", "test_acc");
  });

  it("MacOSKeychainCredentialStore reports name and handles availability", async () => {
    const store = new MacOSKeychainCredentialStore();
    expect(store.name).toContain("macOS");

    const available = await store.isAvailable();
    if (process.platform !== "darwin") {
      expect(available).toBe(false);
    }

    const val = await store.get("service", "account");
    expect(val).toBeNull();

    await store.delete("service", "account");
  });

  it("WindowsCredentialStore reports name and handles operations", async () => {
    const store = new WindowsCredentialStore();
    expect(store.name).toContain("Windows");

    const available = await store.isAvailable();
    if (process.platform !== "win32") {
      expect(available).toBe(false);
    }

    const val = await store.get("service", "account");
    expect(val).toBeNull();

    await store.delete("service", "account");
  });

  it("StoreFactory returns EncryptedVaultCredentialStore when forced or in test", async () => {
    const store = await StoreFactory.getStore(paths, true);
    expect(store).toBeInstanceOf(EncryptedVaultCredentialStore);
    expect(store.name).toContain("Encrypted Vault");
  });

  it("CompositeCredentialStore seamlessly delegates and falls back to encrypted vault", async () => {
    const { CompositeCredentialStore } = await import("@/core/storage/store-factory");
    const vault = new EncryptedVaultCredentialStore(paths);

    // Mock primary that fails on set and get
    const failingPrimary = {
      name: "Mock Failing Keychain",
      isAvailable: async () => true,
      set: async () => {
        throw new Error("Keychain locked");
      },
      get: async () => {
        throw new Error("Keychain locked");
      },
      delete: async () => {
        throw new Error("Keychain locked");
      },
    };

    const composite = new CompositeCredentialStore(failingPrimary, vault);
    expect(composite.name).toContain("Mock Failing Keychain (with Encrypted Vault fallback)");
    expect(await composite.isAvailable()).toBe(true);

    // Should fall back to vault on set
    await composite.set("service", "user", "secret_pass");

    // Should fall back to vault on get
    const retrieved = await composite.get("service", "user");
    expect(retrieved).toBe("secret_pass");

    // Should delete in fallback without throwing
    await composite.delete("service", "user");
    expect(await composite.get("service", "user")).toBeNull();

    // Now test primary when working
    const workingPrimary = {
      name: "Mock Working Keychain",
      isAvailable: async () => true,
      set: async () => {},
      get: async () => "primary_value",
      delete: async () => {},
    };
    const workingComposite = new CompositeCredentialStore(workingPrimary, vault);
    expect(await workingComposite.get("service", "user")).toBe("primary_value");
  });
});
