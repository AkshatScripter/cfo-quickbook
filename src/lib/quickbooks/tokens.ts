import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM token encryption for QB OAuth tokens stored in cfo_qb_tokens.
//
// Storage format (all hex-encoded, concatenated):
//   iv (12 bytes / 24 hex) | authTag (16 bytes / 32 hex) | ciphertext (variable)
//
// Key: QUICKBOOKS_TOKEN_ENC_KEY must be a 64-char hex string (32 bytes).
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX_HEX = (IV_BYTES + TAG_BYTES) * 2; // 56 — minimum length of any stored ciphertext

export function encryptToken(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + tag.toString("hex") + body.toString("hex");
}

export function decryptToken(stored: string): string {
  // Stored values shorter than PREFIX_HEX are not valid ciphertext — likely a
  // plaintext token left over from before encryption was introduced.
  if (stored.length < PREFIX_HEX) {
    throw new Error("QB token format invalid — please reconnect QuickBooks to re-authorise");
  }
  const key = resolveKey();
  const iv = Buffer.from(stored.slice(0, IV_BYTES * 2), "hex");
  const tag = Buffer.from(stored.slice(IV_BYTES * 2, PREFIX_HEX), "hex");
  const body = Buffer.from(stored.slice(PREFIX_HEX), "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(body).toString("utf8") + decipher.final("utf8");
}

function resolveKey(): Buffer {
  const hex = process.env.QUICKBOOKS_TOKEN_ENC_KEY ?? "";
  if (hex.length !== 64) {
    throw new Error(
      "QUICKBOOKS_TOKEN_ENC_KEY must be a 64-char hex string (32 bytes). " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}
