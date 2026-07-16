/**
 * Llaves del modo local.
 *
 * En modo local no hay gestor de secretos, así que la primera vez se genera
 * una ENCRYPTION_KEY (32 bytes aleatorios) y se guarda en data/encryption.key
 * — fuera del repo (data/ está en .gitignore), cumpliendo la regla de "cero
 * credenciales en el código". Si el entorno ya trae ENCRYPTION_KEY (p. ej.
 * .env.local), se respeta y no se toca el archivo.
 *
 * De esa misma llave se derivan (HKDF, contextos distintos) la llave del hash
 * de PIN (lib/auth/pin) y la de firma de sesiones (lib/local/auth).
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function dirDatos(): string {
  return process.env.LOCAL_DATA_DIR ?? path.join(process.cwd(), "data");
}

/** Garantiza que process.env.ENCRYPTION_KEY exista (la genera si hace falta). */
export function asegurarEncryptionKey(): void {
  if (process.env.ENCRYPTION_KEY) return;
  const dir = dirDatos();
  mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, "encryption.key");
  if (!existsSync(archivo)) {
    writeFileSync(archivo, randomBytes(32).toString("base64"), { mode: 0o600 });
    console.info(
      `[local] ENCRYPTION_KEY generada en ${archivo} (no la borres: descifra CURP/RFC y valida PIN/QR/sesiones).`,
    );
  }
  process.env.ENCRYPTION_KEY = readFileSync(archivo, "utf8").trim();
}
