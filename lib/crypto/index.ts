/**
 * lib/crypto — Cifrado de campos sensibles a nivel de columna.
 *
 * Cifra CURP, RFC, fecha de nacimiento (y en fases posteriores salarios y
 * plantillas biométricas) con AES-256-GCM antes de guardarlos en la base.
 *
 * Formato del payload almacenado:  v1:<iv_base64>:<tag_base64>:<cipher_base64>
 *   - "v1" permite rotar de algoritmo/llave sin romper datos históricos.
 *   - GCM es autenticado: cualquier alteración del payload hace fallar el descifrado.
 *
 * La llave viene EXCLUSIVAMENTE de la variable de entorno ENCRYPTION_KEY
 * (32 bytes en base64), provista por el gestor de secretos (Supabase Vault /
 * variables de entorno de Vercel). NUNCA se hardcodea ni se versiona.
 *
 * Este módulo es solo de servidor: usa node:crypto y una llave secreta.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado para GCM
const KEY_LENGTH = 32; // AES-256

class CryptoConfigError extends Error {}
class DecryptionError extends Error {}

function getKey(): Buffer {
  if (typeof window !== "undefined") {
    throw new CryptoConfigError(
      "lib/crypto solo puede usarse en el servidor; nunca en el navegador.",
    );
  }
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new CryptoConfigError(
      "Falta ENCRYPTION_KEY en el entorno. Genera una con `npm run generate:key` y guárdala en .env.local / gestor de secretos.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new CryptoConfigError(
      `ENCRYPTION_KEY inválida: se esperan ${KEY_LENGTH} bytes en base64 (se recibieron ${key.length}).`,
    );
  }
  return key;
}

/** Cifra un valor sensible (CURP, RFC, fecha de nacimiento, …). */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Descifra un payload producido por encryptField. Lanza si fue alterado. */
export function decryptField(payload: string): string {
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new DecryptionError(
      "Payload cifrado con formato desconocido; se esperaba v1:<iv>:<tag>:<cipher>.",
    );
  }
  const [, ivB64, tagB64, cipherB64] = parts;
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new DecryptionError(
      "No se pudo descifrar el campo: llave incorrecta o payload alterado.",
    );
  }
}

/** Variante que tolera columnas opcionales (curp/rfc pueden ser null). */
export function encryptNullable(
  plaintext: string | null | undefined,
): string | null {
  return plaintext == null || plaintext === "" ? null : encryptField(plaintext);
}

export function decryptNullable(
  payload: string | null | undefined,
): string | null {
  return payload == null || payload === "" ? null : decryptField(payload);
}

export { CryptoConfigError, DecryptionError };
