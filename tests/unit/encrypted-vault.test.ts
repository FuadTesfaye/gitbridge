import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EncryptedVaultCredentialStore } from "@/core/storage/encrypted-vault";
import { PathResolver } from "@/core/config/path-resolver";

describe("EncryptedVaultCredentialStore", () => {
  let tempDir: string;
  let store: EncryptedVaultCredentialStore;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-vault-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new EncryptedVaultCredentialStore(paths);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("stores, retrieves, and deletes encrypted credentials", async () => {
    expect(await store.isAvailable()).toBe(true);

    await store.set("github.com", "user_personal", "gho_token_123456789");
    await store.set("gitlab.com", "user_work", "glpat_987654321");

    const ghToken = await store.get("github.com", "user_personal");
    expect(ghToken).toBe("gho_token_123456789");

    const glToken = await store.get("gitlab.com", "user_work");
    expect(glToken).toBe("glpat_987654321");

    const missing = await store.get("github.com", "non_existent");
    expect(missing).toBeNull();

    await store.delete("github.com", "user_personal");
    const afterDelete = await store.get("github.com", "user_personal");
    expect(afterDelete).toBeNull();
  });
});
