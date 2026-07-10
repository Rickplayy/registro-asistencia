/**
 * Código QR dinámico y rotativo por empleado.
 *
 * REGLA: el QR debe ser rotativo, no estático — una foto del código deja de
 * servir en cuanto rota (paso de 30 segundos, ventana de ±1 paso).
 *
 * Diseño:
 *  - Cada empleado tiene un secreto aleatorio de 32 bytes, guardado CIFRADO
 *    (AES-256-GCM vía lib/crypto) en metodos_acceso.valor_hash_o_token.
 *  - El QR codifica: RA1.<id del método>.<código TOTP de 8 dígitos>.
 *  - El kiosko envía el texto del QR; el servidor busca el método por id,
 *    descifra el secreto y verifica el TOTP.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { QR_PASO_SEGUNDOS } from "./qr-constantes";

export { QR_PASO_SEGUNDOS };

const PREFIJO = "RA1";
const DIGITOS = 8;
const VENTANA = 1; // acepta el paso actual y ±1 (tolerancia de reloj/escaneo)

/** Genera el secreto TOTP de un empleado (base64, se guarda cifrado). */
export function generarSecretoQr(): string {
  return randomBytes(32).toString("base64");
}

function totp(secretoB64: string, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = createHmac("sha256", Buffer.from(secretoB64, "base64"))
    .update(contador)
    .digest();
  // Truncado dinámico (RFC 4226 adaptado a SHA-256)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codigo =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return (codigo % 10 ** DIGITOS).toString().padStart(DIGITOS, "0");
}

function pasoActual(ahora: Date): number {
  return Math.floor(ahora.getTime() / 1000 / QR_PASO_SEGUNDOS);
}

/** Contenido vigente del QR de un empleado. */
export function generarPayloadQr(
  metodoId: string,
  secretoB64: string,
  ahora: Date = new Date(),
): string {
  return `${PREFIJO}.${metodoId}.${totp(secretoB64, pasoActual(ahora))}`;
}

/** Segundos que le quedan de vigencia al payload actual. */
export function segundosRestantesQr(ahora: Date = new Date()): number {
  return (
    QR_PASO_SEGUNDOS - (Math.floor(ahora.getTime() / 1000) % QR_PASO_SEGUNDOS)
  );
}

/** Extrae el id del método de acceso de un texto escaneado; null si no es nuestro formato. */
export function parsearPayloadQr(
  texto: string,
): { metodoId: string; codigo: string } | null {
  const partes = texto.trim().split(".");
  if (partes.length !== 3 || partes[0] !== PREFIJO) return null;
  const [, metodoId, codigo] = partes;
  const esUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      metodoId,
    );
  if (!esUuid || !/^\d{8}$/.test(codigo)) return null;
  return { metodoId, codigo };
}

/** Verifica un código TOTP contra el secreto, con ventana de ±1 paso. */
export function verificarCodigoQr(
  secretoB64: string,
  codigo: string,
  ahora: Date = new Date(),
): boolean {
  const paso = pasoActual(ahora);
  for (let i = -VENTANA; i <= VENTANA; i++) {
    const esperado = totp(secretoB64, paso + i);
    if (
      codigo.length === esperado.length &&
      timingSafeEqual(Buffer.from(codigo), Buffer.from(esperado))
    ) {
      return true;
    }
  }
  return false;
}
