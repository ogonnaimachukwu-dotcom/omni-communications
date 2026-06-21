import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "@/env";

/**
 * AES-256-GCM authenticated encryption for secrets at rest.
 *
 * Phase 1 encrypts directly under the master key (held outside the DB, injected
 * as a Docker/host secret). The `keyVersion` field is carried now so per-record
 * data-key wrapping and key rotation can be layered in later without a schema
 * change. Decrypt only in-memory, at point of use; never log plaintext.
 *
 * Honest limitation (architecture §8): on a self-managed VPS without a KMS, root
 * compromise of the host can reach the master key. Mitigations: LUKS disk
 * encryption, least privilege, future migration to a managed KMS/Vault.
 */

const MASTER_KEY = Buffer.from(env.ENCRYPTION_MASTER_KEY, "base64");
const KEY_VERSION = 1;

export interface SealedSecret {
  v: number; // key version
  iv: string; // base64
  tag: string; // base64 GCM auth tag
  data: string; // base64 ciphertext
}

export function seal(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: KEY_VERSION,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
}

export function open(sealed: SealedSecret): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    MASTER_KEY,
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(sealed.data, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

// Convenience: store as a single string column when desired.
export const sealToString = (plaintext: string): string =>
  JSON.stringify(seal(plaintext));

export const openFromString = (s: string): string =>
  open(JSON.parse(s) as SealedSecret);
