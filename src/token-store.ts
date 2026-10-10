import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const FORMAT_VERSION = 1;

export interface OAuthTokenSet {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
  id_token?: string | null;
}

interface EncryptedEnvelope {
  version: number;
  iv: string;
  tag: string;
  ciphertext: string;
}

export function parseEncryptionKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a canonical base64 value for exactly 32 random bytes.");
  }
  return key;
}

export function encryptJson(value: unknown, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("Token encryption requires a 32-byte key.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  const envelope: EncryptedEnvelope = {
    version: FORMAT_VERSION,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
  return JSON.stringify(envelope);
}

export function decryptJson<T>(serialized: string, key: Buffer): T {
  const envelope = JSON.parse(serialized) as EncryptedEnvelope;
  if (envelope.version !== FORMAT_VERSION) {
    throw new Error("Unsupported encrypted token file format.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

function configuredStorePath(): string {
  return resolve(process.env.TOKEN_STORE_PATH ?? ".data/google-tokens.enc");
}

function configuredKey(): Buffer {
  const encodedKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY is missing. Copy .env.example to .env and generate a key with npm run generate-key.");
  }
  return parseEncryptionKey(encodedKey);
}

export async function saveTokens(tokens: OAuthTokenSet): Promise<void> {
  const path = configuredStorePath();
  const key = configuredKey();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  const temporaryPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporaryPath, encryptJson(tokens, key), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}

export async function loadTokens(): Promise<OAuthTokenSet | null> {
  const path = configuredStorePath();
  let serialized: string;
  try {
    serialized = await readFile(path, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  return decryptJson<OAuthTokenSet>(serialized, configuredKey());
}

export async function saveTokensAtPath(path: string, tokens: OAuthTokenSet, key: Buffer): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${absolutePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporaryPath, encryptJson(tokens, key), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporaryPath, absolutePath);
  await chmod(absolutePath, 0o600);
}

export async function loadTokensAtPath(path: string, key: Buffer): Promise<OAuthTokenSet | null> {
  try {
    return decryptJson<OAuthTokenSet>(await readFile(resolve(path), "utf8"), key);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
