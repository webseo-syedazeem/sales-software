import crypto from "crypto";

function getEncryptionKeyBuffer(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SECURITY MISCONFIGURATION: DATA_ENCRYPTION_KEY must be set (>= 32 chars) in production."
      );
    }
    return crypto.createHash("sha256").update("local-dev-ephemeral-key").digest();
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSensitive(plainText: string): string {
  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSensitive(cipherText: string): string {
  const parts = cipherText.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted payload format");
  const [ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKeyBuffer();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function signHmac(payload: string): string {
  const key = getEncryptionKeyBuffer();
  return crypto.createHmac("sha256", key).update(payload).digest("hex");
}

export function verifyHmac(payload: string, signatureHex: string): boolean {
  try {
    const expected = Buffer.from(signHmac(payload), "hex");
    const provided = Buffer.from(signatureHex, "hex");
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively strips MongoDB operator keys ($...) and prototype-pollution keys
 * from untrusted JSON payloads before validation or persistence.
 */
export function sanitizePayload<T>(input: T): T {
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) {
    return input.map((item) => sanitizePayload(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k) || k.startsWith("$") || k.includes(".")) continue;
    clean[k] = sanitizePayload(v);
  }
  return clean as T;
}
