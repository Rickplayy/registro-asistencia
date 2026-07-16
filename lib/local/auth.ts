/**
 * Autenticación local — reemplaza Supabase Auth (GoTrue) sin servicios externos.
 *
 * - Cuentas en la tabla auth_users (SQLite local).
 * - Contraseñas con scrypt (node:crypto) + salt aleatorio; nunca en claro.
 * - Sesión: token firmado HMAC-SHA256 (payload.firma en base64url) guardado en
 *   la cookie httpOnly "ra_session". La llave de firma se deriva con HKDF de
 *   ENCRYPTION_KEY (contexto propio), así que no hay secretos nuevos.
 *
 * Igual que en el diseño original, el login administrativo queda separado por
 * completo del flujo del kiosko (que usa su propia cookie ra_kiosko).
 */
import {
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { obtenerDb } from "./database";
import { asegurarEncryptionKey } from "./llaves";

export const COOKIE_SESION = "ra_session";
export const SESION_DIAS = 7;

export type UsuarioLocal = {
  id: string;
  email: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Contraseñas (scrypt)
// ---------------------------------------------------------------------------

const SCRYPT_LARGO = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_LARGO);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verificarPassword(password: string, guardado: string): boolean {
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const salt = Buffer.from(partes[1], "base64");
  const esperado = Buffer.from(partes[2], "base64");
  const calculado = scryptSync(password, salt, esperado.length);
  return timingSafeEqual(calculado, esperado);
}

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

export type ResultadoCuenta =
  | { user: UsuarioLocal; error: null }
  | { user: null; error: { message: string; code: string } };

export function crearCuenta(email: string, password: string): ResultadoCuenta {
  const correo = email.trim().toLowerCase();
  if (!correo || !password) {
    return {
      user: null,
      error: { message: "Correo y contraseña son obligatorios.", code: "validation_failed" },
    };
  }
  const db = obtenerDb();
  const existe = db
    .prepare("select id from auth_users where email = ? collate nocase")
    .get(correo);
  if (existe) {
    return {
      user: null,
      error: {
        message: "A user with this email address has already been registered",
        code: "email_exists",
      },
    };
  }
  const id = randomUUID();
  db.prepare(
    "insert into auth_users (id, email, password_hash) values (?, ?, ?)",
  ).run(id, correo, hashPassword(password));
  return { user: obtenerCuenta(id)!, error: null };
}

export function borrarCuenta(id: string): void {
  // ON DELETE CASCADE elimina también el perfil en usuarios_admin.
  obtenerDb().prepare("delete from auth_users where id = ?").run(id);
}

export function obtenerCuenta(id: string): UsuarioLocal | null {
  const fila = obtenerDb()
    .prepare("select id, email, created_at from auth_users where id = ?")
    .get(id) as UsuarioLocal | undefined;
  return fila ?? null;
}

/** Valida credenciales; regresa la cuenta o null (mensaje único, sin filtrar cuáles correos existen). */
export function verificarCredenciales(
  email: string,
  password: string,
): UsuarioLocal | null {
  const fila = obtenerDb()
    .prepare(
      "select id, email, password_hash, created_at from auth_users where email = ? collate nocase",
    )
    .get(email.trim().toLowerCase()) as
    | (UsuarioLocal & { password_hash: string })
    | undefined;
  if (!fila || !verificarPassword(password, fila.password_hash)) return null;
  return { id: fila.id, email: fila.email, created_at: fila.created_at };
}

// ---------------------------------------------------------------------------
// Tokens de sesión (HMAC firmado, verificable sin tocar la base)
// ---------------------------------------------------------------------------

function llaveSesion(): Buffer {
  asegurarEncryptionKey();
  const master = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");
  if (master.length !== 32) {
    throw new Error("ENCRYPTION_KEY inválida: se esperan 32 bytes en base64.");
  }
  return Buffer.from(hkdfSync("sha256", master, "", "ra-sesion-hmac-v1", 32));
}

function firmar(payloadB64: string): string {
  return createHmac("sha256", llaveSesion()).update(payloadB64).digest("base64url");
}

export function emitirTokenSesion(user: UsuarioLocal): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + SESION_DIAS * 24 * 60 * 60,
    }),
  ).toString("base64url");
  return `${payload}.${firmar(payload)}`;
}

export function verificarTokenSesion(
  token: string | undefined | null,
): { id: string; email: string } | null {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [payloadB64, firma] = partes;
  const esperada = firmar(payloadB64);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return { id: payload.sub, email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}
