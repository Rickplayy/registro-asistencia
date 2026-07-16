/**
 * Siembra una base de DEMO para pruebas (modo local): una empresa, un
 * administrador y 15 empleados con PIN + QR, dos kioskos y ~2 semanas de
 * asistencia histórica (con retardos y faltas realistas) para que el dashboard
 * y los reportes tengan contenido.
 *
 *   npm run seed:demo
 *
 * Reutiliza la lógica REAL de la app para lo que debe coincidir exactamente:
 *   - lib/crypto        → cifrado AES-256-GCM de CURP/RFC/fecha de nacimiento
 *   - lib/auth/pin      → hash HMAC del PIN (para que el kiosko lo reconozca)
 *   - lib/local/schema  → DDL (única fuente de verdad del esquema)
 *   - lib/local/llaves  → misma resolución/generación de ENCRYPTION_KEY
 * El resto (cuenta admin scrypt, secreto QR, inserciones) va por SQL directo,
 * que es justo lo que hace el cliente de servicio internamente.
 *
 * Es idempotente: vuelve a sembrar borrando primero la empresa de demo.
 */
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

import { DDL } from "../lib/local/schema.ts";
import { asegurarEncryptionKey, dirDatos } from "../lib/local/llaves.ts";
import { generarPin, hashPin } from "../lib/auth/pin.ts";
import { encryptField, encryptNullable } from "../lib/crypto/index.ts";

// La app (next dev/start) carga .env.local; respetamos la MISMA llave para que
// lo cifrado y los hashes de PIN coincidan con lo que leerá el servidor.
config({ path: ".env.local" });
config({ path: ".env" });
asegurarEncryptionKey();

// --- Datos de la demo -------------------------------------------------------

const EMPRESA = {
  nombre: "Panadería La Espiga S.A. de C.V.",
  rfc: "PES010101AA1",
  hora_entrada: "09:00:00",
  hora_salida: "18:00:00",
  tolerancia: 15,
};

const ADMIN = {
  nombre: "María Fernanda Ríos",
  email: "admin@laespiga.mx",
  password: "Espiga2027!",
};

// 15 empleados con nombres/puestos plausibles del mercado mexicano.
const EMPLEADOS = [
  ["Juan Carlos Hernández López", "Panadero", "H"],
  ["Ana Gabriela Martínez Cruz", "Cajera", "M"],
  ["José Luis Ramírez Torres", "Repartidor", "H"],
  ["Guadalupe Sánchez Flores", "Mostrador", "M"],
  ["Miguel Ángel Gómez Díaz", "Supervisor de turno", "H"],
  ["Laura Patricia Jiménez Ruiz", "Pastelera", "M"],
  ["Roberto Carlos Vázquez Mendoza", "Panadero", "H"],
  ["Diana Sofía Castillo Romero", "Auxiliar de producción", "M"],
  ["Fernando Javier Morales Ortiz", "Repartidor", "H"],
  ["Karla Alejandra Reyes Guzmán", "Cajera", "M"],
  ["Ricardo Antonio Domínguez Peña", "Almacén", "H"],
  ["Mónica Isabel Aguilar Núñez", "Mostrador", "M"],
  ["Sergio Daniel Estrada Campos", "Panadero", "H"],
  ["Verónica Elena Padilla Rojas", "Pastelera", "M"],
  ["Óscar Eduardo Navarro Salazar", "Auxiliar de limpieza", "H"],
];

const DISPOSITIVOS = ["Kiosko Entrada Principal", "Kiosko Producción"];

// --- Utilidades -------------------------------------------------------------

const dosDig = (n) => String(n).padStart(2, "0");

/** Hash de contraseña con el MISMO formato que lib/local/auth.ts (scrypt). */
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Secreto QR: 32 bytes base64 (igual que lib/auth/qr.generarSecretoQr). */
const generarSecretoQr = () => randomBytes(32).toString("base64");

/** CURP/RFC plausibles (18/13 chars) solo para tener datos cifrados de muestra. */
const LETRAS = "ABCDEFGHIJKLMNPQRSTUVWXYZ";
const al = (arr) => arr[Math.floor(Math.random() * arr.length)];
function curpFalso(sexo, i) {
  const l = () => al([...LETRAS]);
  const anio = dosDig(70 + (i % 30));
  const mes = dosDig(1 + (i % 12));
  const dia = dosDig(1 + (i % 28));
  const edo = "DF";
  return `${l()}${l()}${l()}${l()}${anio}${mes}${dia}${sexo}${edo}${l()}${l()}${l()}${dosDig(i)}`.slice(0, 18);
}
function rfcFalso(i) {
  const l = () => al([...LETRAS]);
  return `${l()}${l()}${l()}${l()}${dosDig(80 + (i % 20))}${dosDig(1 + (i % 12))}${dosDig(1 + (i % 28))}${l()}${l()}${i % 10}`;
}

/** Fechas (America/Mexico_City) de los últimos N días, más reciente primero. */
function ultimosDias(n) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  const baseUTC = Date.UTC(y, m - 1, d);
  const dias = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(baseUTC - i * 86_400_000);
    const fecha = `${t.getUTCFullYear()}-${dosDig(t.getUTCMonth() + 1)}-${dosDig(t.getUTCDate())}`;
    dias.push({ fecha, diaSemana: t.getUTCDay() }); // 0=Dom .. 6=Sáb
  }
  return dias;
}

const horaConOffset = (base, min) => {
  const total = base * 60 + min;
  return `${dosDig(Math.floor(total / 60))}:${dosDig(total % 60)}:${dosDig(Math.floor(Math.random() * 60))}`;
};

/** registrado_en absoluto (UTC ISO) a partir de fecha+hora en CDMX (UTC-6). */
const marcaTiempo = (fecha, hora) =>
  new Date(`${fecha}T${hora}-06:00`).toISOString();

// --- Apertura de la base ----------------------------------------------------

const ruta =
  process.env.LOCAL_DB_PATH ??
  path.join(dirDatos(), "registro-asistencia.db");
if (ruta !== ":memory:") mkdirSync(path.dirname(ruta), { recursive: true });
const db = new DatabaseSync(ruta);
db.exec("pragma journal_mode = wal");
db.exec("pragma foreign_keys = on");
db.exec(DDL);

// --- Teardown de una siembra previa (idempotencia) --------------------------

const previa = db
  .prepare("select id from empresas where rfc_empresa = ?")
  .get(EMPRESA.rfc);
if (previa) {
  for (const t of [
    "registros_asistencia",
    "metodos_acceso",
    "consentimientos",
    "credenciales_biometricas",
    "dispositivos",
    "auditoria",
    "empleados",
    "usuarios_admin",
  ]) {
    db.prepare(`delete from ${t} where empresa_id = ?`).run(previa.id);
  }
  db.prepare("delete from empresas where id = ?").run(previa.id);
}
db.prepare("delete from auth_users where email = ? collate nocase").run(
  ADMIN.email.toLowerCase(),
);

// --- Empresa + admin --------------------------------------------------------

const empresaId = randomUUID();
db.prepare(
  `insert into empresas (id, nombre, rfc_empresa, config_metodos_habilitados, activa, hora_entrada, hora_salida, tolerancia_retardo_minutos)
   values (?, ?, ?, '["pin","qr"]', 1, ?, ?, ?)`,
).run(
  empresaId,
  EMPRESA.nombre,
  EMPRESA.rfc,
  EMPRESA.hora_entrada,
  EMPRESA.hora_salida,
  EMPRESA.tolerancia,
);

const authId = randomUUID();
db.prepare(
  "insert into auth_users (id, email, password_hash) values (?, ?, ?)",
).run(authId, ADMIN.email.toLowerCase(), hashPassword(ADMIN.password));
db.prepare(
  `insert into usuarios_admin (id, auth_user_id, empresa_id, nombre, email, rol)
   values (?, ?, ?, ?, ?, 'admin_empresa')`,
).run(randomUUID(), authId, empresaId, ADMIN.nombre, ADMIN.email.toLowerCase());

// --- Empleados + PIN + QR + consentimiento ----------------------------------

const stmtEmpleado = db.prepare(
  `insert into empleados (id, empresa_id, nombre, puesto, numero_empleado, curp_cifrado, rfc_cifrado, fecha_nacimiento_cifrada, sexo, estatus, fecha_ingreso)
   values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?)`,
);
const stmtMetodo = db.prepare(
  `insert into metodos_acceso (id, empleado_id, empresa_id, tipo, valor_hash_o_token, activo)
   values (?, ?, ?, ?, ?, 1)`,
);
const stmtConsent = db.prepare(
  `insert into consentimientos (id, empleado_id, empresa_id, tipo_dato, version_aviso_privacidad, otorgado)
   values (?, ?, ?, 'datos_personales', 'v1.0-2026-07', 1)`,
);

const pinsUsados = new Set();
const empleados = [];

EMPLEADOS.forEach(([nombre, puesto, sexo], i) => {
  const idx = i + 1;
  const empleadoId = randomUUID();
  const fnac = `19${dosDig(70 + (i % 30))}-${dosDig(1 + (i % 12))}-${dosDig(1 + (i % 28))}`;
  const fingreso = `20${dosDig(18 + (i % 8))}-${dosDig(1 + (i % 12))}-${dosDig(1 + (i % 27))}`;

  stmtEmpleado.run(
    empleadoId,
    empresaId,
    nombre,
    puesto,
    `EMP${dosDig(idx)}`,
    encryptNullable(curpFalso(sexo, idx)),
    encryptNullable(rfcFalso(idx)),
    encryptNullable(fnac),
    sexo,
    fingreso,
  );

  // PIN único por empresa (el índice único es sobre el hash).
  let pin;
  do {
    pin = generarPin();
  } while (pinsUsados.has(pin));
  pinsUsados.add(pin);
  stmtMetodo.run(
    randomUUID(),
    empleadoId,
    empresaId,
    "pin",
    hashPin(pin, empresaId),
  );
  stmtMetodo.run(
    randomUUID(),
    empleadoId,
    empresaId,
    "qr",
    encryptField(generarSecretoQr()),
  );
  stmtConsent.run(randomUUID(), empleadoId, empresaId);

  empleados.push({ id: empleadoId, nombre, puesto, numero: `EMP${dosDig(idx)}`, pin });
});

// --- Dispositivos (kioskos) -------------------------------------------------
// Nota: aquí solo se IMPRIME la clave para la demo; la app nunca almacena la
// clave en claro (solo su hash). Reusamos el mismo hash SHA-256.
const hashApiKey = (clave) => createHash("sha256").update(clave).digest("hex");

const dispositivos = DISPOSITIVOS.map((nombre) => {
  const clave = `RA-KIOSKO-${randomBytes(24).toString("hex")}`;
  db.prepare(
    `insert into dispositivos (id, empresa_id, tipo, nombre, api_key_hash, activo)
     values (?, ?, 'kiosko', ?, ?, 1)`,
  ).run(randomUUID(), empresaId, nombre, hashApiKey(clave));
  return { nombre, clave };
});

// --- Asistencia histórica (últimos 14 días, L-V) ----------------------------

const stmtRegistro = db.prepare(
  `insert into registros_asistencia (id, empleado_id, empresa_id, metodo, tipo, fecha, hora, registrado_en, dispositivo_id)
   values (?, ?, ?, ?, ?, ?, ?, ?, null)`,
);

const dias = ultimosDias(14).reverse(); // del más antiguo al más reciente
const hoyStr = dias[dias.length - 1].fecha;
let totalMarcas = 0;

for (const { fecha, diaSemana } of dias) {
  if (diaSemana === 0 || diaSemana === 6) continue; // solo L-V
  const esHoy = fecha === hoyStr;

  for (const emp of empleados) {
    // ~10% de falta en días pasados; hoy asumimos que casi todos ya llegaron.
    if (!esHoy && Math.random() < 0.1) continue;

    const metodo = Math.random() < 0.2 ? "qr" : "pin";
    // Entrada 08:45–09:25 → algunas > 09:15 cuentan como retardo.
    const horaEntrada = horaConOffset(9, Math.floor(Math.random() * 41) - 15);
    stmtRegistro.run(
      randomUUID(),
      emp.id,
      empresaId,
      metodo,
      "entrada",
      fecha,
      horaEntrada,
      marcaTiempo(fecha, horaEntrada),
    );
    totalMarcas++;

    // Salida: siempre en días pasados; hoy solo ~30% ya salió.
    if (!esHoy || Math.random() < 0.3) {
      const horaSalida = horaConOffset(18, Math.floor(Math.random() * 46) - 10);
      stmtRegistro.run(
        randomUUID(),
        emp.id,
        empresaId,
        metodo,
        "salida",
        fecha,
        horaSalida,
        marcaTiempo(fecha, horaSalida),
      );
      totalMarcas++;
    }
  }
}

// --- Resumen ----------------------------------------------------------------

const linea = "─".repeat(64);
console.log(`\n${linea}`);
console.log("  BASE DE DEMO SEMBRADA");
console.log(linea);
console.log(`  Base:      ${ruta}`);
console.log(`  Empresa:   ${EMPRESA.nombre} (${EMPRESA.rfc})`);
console.log(`  Marcajes:  ${totalMarcas} en los últimos 14 días (L-V)`);
console.log(linea);
console.log("  ADMINISTRADOR (login en /login)");
console.log(`    Correo:      ${ADMIN.email}`);
console.log(`    Contraseña:  ${ADMIN.password}`);
console.log(linea);
console.log("  KIOSKOS (pega la clave en /kiosko para vincular)");
for (const d of dispositivos) console.log(`    ${d.nombre}\n      ${d.clave}`);
console.log(linea);
console.log("  EMPLEADOS Y SUS PIN (para fichar en el kiosko)");
for (const e of empleados) {
  console.log(
    `    ${e.numero}  PIN ${e.pin}  ·  ${e.nombre.padEnd(34)} ${e.puesto}`,
  );
}
console.log(linea);
console.log("  Arranca con:  npm run dev   →   http://localhost:3000\n");
