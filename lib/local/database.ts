/**
 * Motor de base de datos del modo local: SQLite vía node:sqlite (integrado en
 * Node ≥ 22.5, sin dependencias externas ni binarios nativos de npm).
 *
 * - Archivo: data/registro-asistencia.db (configurable con LOCAL_DB_PATH;
 *   ":memory:" para pruebas).
 * - Singleton en globalThis para sobrevivir el hot-reload de Next en dev.
 * - Aplica el esquema (lib/local/schema) de forma idempotente al abrir.
 *
 * Este módulo es SOLO de servidor.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { DDL } from "./schema";
import { asegurarEncryptionKey, dirDatos } from "./llaves";

const GLOBAL_KEY = "__registroAsistenciaDbLocal";

function abrir(): DatabaseSync {
  if (typeof window !== "undefined") {
    throw new Error("lib/local/database solo puede usarse en el servidor.");
  }
  asegurarEncryptionKey();

  let ruta = process.env.LOCAL_DB_PATH;
  if (!ruta) {
    const dir = dirDatos();
    mkdirSync(dir, { recursive: true });
    ruta = path.join(dir, "registro-asistencia.db");
  }

  const db = new DatabaseSync(ruta);
  db.exec("pragma journal_mode = wal");
  db.exec("pragma foreign_keys = on");
  db.exec(DDL);
  return db;
}

/** Conexión única del proceso (creada bajo demanda). */
export function obtenerDb(): DatabaseSync {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DatabaseSync };
  g[GLOBAL_KEY] ??= abrir();
  return g[GLOBAL_KEY];
}
