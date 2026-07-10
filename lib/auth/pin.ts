/**
 * PIN de acceso al kiosko.
 *
 * REGLA: el PIN nunca se guarda en texto plano — solo su hash.
 *
 * El hash es un HMAC-SHA256 con llave derivada (HKDF) de ENCRYPTION_KEY y
 * amarrado a la empresa: determinista, para que el kiosko pueda buscar por
 * hash, pero imposible de precomputar sin la llave del servidor. Que sea
 * determinista dentro de la empresa además garantiza PINs únicos por empresa
 * (índice único sobre el hash).
 */
import { createHmac, hkdfSync, randomInt } from "node:crypto";

const PIN_LARGO = 6;

function llavePin(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Falta ENCRYPTION_KEY en el entorno (requerida para el hash de PIN).",
    );
  }
  const master = Buffer.from(raw, "base64");
  if (master.length !== 32) {
    throw new Error("ENCRYPTION_KEY inválida: se esperan 32 bytes en base64.");
  }
  return Buffer.from(hkdfSync("sha256", master, "", "ra-pin-hmac-v1", 32));
}

/** Genera un PIN numérico aleatorio de 6 dígitos (criptográficamente seguro). */
export function generarPin(): string {
  return randomInt(0, 10 ** PIN_LARGO)
    .toString()
    .padStart(PIN_LARGO, "0");
}

/** Hash determinista del PIN, amarrado a la empresa. */
export function hashPin(pin: string, empresaId: string): string {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error("PIN inválido: se esperan de 4 a 8 dígitos.");
  }
  return createHmac("sha256", llavePin())
    .update(`${empresaId}:${pin}`)
    .digest("hex");
}
