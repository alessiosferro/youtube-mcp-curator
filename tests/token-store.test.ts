import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decryptJson, encryptJson, loadTokensAtPath, saveTokensAtPath } from "../src/token-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("encrypted Google token storage", () => {
  it("encrypts tokens at rest and restores them with the same key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "social-curator-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "tokens.enc");
    const key = randomBytes(32);
    const tokens = { access_token: "private-access", refresh_token: "private-refresh" };

    await saveTokensAtPath(path, tokens, key);

    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("private-access");
    expect(raw).not.toContain("private-refresh");
    await expect(loadTokensAtPath(path, key)).resolves.toEqual(tokens);
  });

  it("rejects tampered ciphertext and an incorrect key", () => {
    const key = randomBytes(32);
    const encrypted = encryptJson({ refresh_token: "secret" }, key);
    expect(() => decryptJson(encrypted, randomBytes(32))).toThrow();
    const envelope = JSON.parse(encrypted) as { ciphertext: string };
    envelope.ciphertext = Buffer.from("tampered").toString("base64");
    expect(() => decryptJson(JSON.stringify(envelope), key)).toThrow();
  });

  it("does not persist a plaintext token file when the store is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "social-curator-"));
    temporaryDirectories.push(directory);
    await expect(loadTokensAtPath(join(directory, "missing.enc"), randomBytes(32))).resolves.toBeNull();
  });
});
