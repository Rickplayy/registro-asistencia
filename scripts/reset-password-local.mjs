/**
 * Reinicio de contraseña en modo local (no hay envío de correo).
 * Uso: npm run reset-password -- <email> <nueva-contraseña>
 *
 * Escribe directo sobre data/registro-asistencia.db con el mismo formato
 * scrypt que usa lib/local/auth.ts.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Uso: npm run reset-password -- <email> <nueva-contraseña>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const ruta =
  process.env.LOCAL_DB_PATH ??
  path.join(
    process.env.LOCAL_DATA_DIR ?? path.join(process.cwd(), "data"),
    "registro-asistencia.db",
  );
if (!existsSync(ruta)) {
  console.error(`No existe la base local en ${ruta}. ¿Ya corriste la app?`);
  process.exit(1);
}

const db = new DatabaseSync(ruta);
const salt = randomBytes(16);
const hash = `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, 64).toString("base64")}`;
const info = db
  .prepare(
    "update auth_users set password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where email = ? collate nocase",
  )
  .run(hash, email.trim().toLowerCase());

console.log(
  info.changes > 0
    ? `Contraseña actualizada para ${email}.`
    : `No existe una cuenta con el correo ${email}.`,
);
