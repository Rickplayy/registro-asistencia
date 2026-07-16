/**
 * Cliente local compatible con la API de Supabase que usa este proyecto
 * (query builder de PostgREST + Auth), respaldado por SQLite (node:sqlite).
 *
 * Cubre exactamente la superficie que consume el código:
 *   from(t).select/insert/update/delete + eq/neq/gt/gte/lt/lte/in/is/like
 *   + order/limit/single/maybeSingle + select("…, relacion(cols)")
 *   + select(cols, { count: "exact", head: true })
 *   auth.getUser / signInWithPassword / signOut / resetPasswordForEmail
 *   auth.admin.createUser / deleteUser (solo cliente de servicio)
 *
 * REGLA INQUEBRANTABLE (RLS): como SQLite no tiene Row Level Security, las
 * políticas de supabase/migrations/20260709000002_rls_policies.sql se emulan
 * aquí (POLITICAS), tabla por tabla y con la misma semántica de Postgres:
 *   - SELECT fuera de alcance → filas filtradas, sin error.
 *   - INSERT sin política que lo permita → error 42501.
 *   - UPDATE/DELETE fuera de alcance → 0 filas afectadas, sin error.
 *   - anon → cero acceso. service → bypass (solo backend).
 * tests/rls-isolation.test.ts verifica este aislamiento en cada corrida.
 */
import { randomUUID } from "node:crypto";

import { obtenerDb } from "./database";
import { FK_RELACIONES, TABLAS } from "./schema";
import {
  COOKIE_SESION,
  SESION_DIAS,
  borrarCuenta,
  crearCuenta,
  emitirTokenSesion,
  obtenerCuenta,
  sesionVigente,
  verificarCredenciales,
  verificarTokenSesion,
  type UsuarioLocal,
} from "./auth";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type ErrorPg = {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
};

// `any` a propósito: reproduce la ergonomía de supabase-js sin esquema
// generado, donde el tipo fino lo fija el llamador (anotación del destino,
// casts o .maybeSingle<PerfilAdmin>()).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Fila = any;

export type Resultado<T = Fila[] | null> = {
  data: T;
  error: ErrorPg | null;
  count: number | null;
};

export type Contexto =
  | { tipo: "service" }
  | { tipo: "anon" }
  | { tipo: "usuario"; authUserId: string };

/** Lo mínimo que piden los módulos que reciben "un cliente" (p. ej. auditar). */
export type ClienteDatos = { from(tabla: string): ConsultaLocal };

export type AdaptadorCookies = {
  get(nombre: string): string | undefined;
  set(
    nombre: string,
    valor: string,
    opciones: {
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
      secure?: boolean;
      path?: string;
      maxAge?: number;
    },
  ): void;
};

type Rol = "super_admin" | "admin_empresa" | "rh" | "supervisor";
type Perfil = { id: string; empresa_id: string | null; rol: Rol };

// ---------------------------------------------------------------------------
// Emulación de las políticas RLS (espejo de la migración 0002)
// ---------------------------------------------------------------------------

type Alcance =
  | { tipo: "todo" }
  | { tipo: "nada" }
  | { tipo: "filtro"; sql: string; params: unknown[] };

const NADA: Alcance = { tipo: "nada" };
const TODO: Alcance = { tipo: "todo" };

function filtroEmpresa(perfil: Perfil): Alcance {
  return { tipo: "filtro", sql: `"empresa_id" = ?`, params: [perfil.empresa_id] };
}

const esGestor = (rol: Rol) => rol === "admin_empresa" || rol === "rh";

type Politica = {
  select?: (p: Perfil, uid: string) => Alcance;
  insert?: (p: Perfil, fila: Record<string, unknown>) => boolean;
  update?: (p: Perfil) => Alcance;
  delete?: (p: Perfil) => Alcance;
};

const POLITICAS: Record<string, Politica> = {
  empresas: {
    select: (p) =>
      p.rol === "super_admin"
        ? TODO
        : { tipo: "filtro", sql: `"id" = ?`, params: [p.empresa_id] },
    update: (p) =>
      p.rol === "admin_empresa"
        ? { tipo: "filtro", sql: `"id" = ?`, params: [p.empresa_id] }
        : NADA,
  },
  empleados: {
    select: (p) => (p.rol === "super_admin" ? TODO : filtroEmpresa(p)),
    insert: (p, fila) => esGestor(p.rol) && fila.empresa_id === p.empresa_id,
    update: (p) => (esGestor(p.rol) ? filtroEmpresa(p) : NADA),
    delete: (p) => (p.rol === "admin_empresa" ? filtroEmpresa(p) : NADA),
  },
  credenciales_biometricas: {
    select: (p) => (esGestor(p.rol) ? filtroEmpresa(p) : NADA),
    insert: (p, fila) => esGestor(p.rol) && fila.empresa_id === p.empresa_id,
    update: (p) => (esGestor(p.rol) ? filtroEmpresa(p) : NADA),
    delete: (p) => (esGestor(p.rol) ? filtroEmpresa(p) : NADA),
  },
  metodos_acceso: {
    select: (p) => filtroEmpresa(p),
    insert: (p, fila) => esGestor(p.rol) && fila.empresa_id === p.empresa_id,
    update: (p) => (esGestor(p.rol) ? filtroEmpresa(p) : NADA),
    delete: (p) => (esGestor(p.rol) ? filtroEmpresa(p) : NADA),
  },
  // Las marcaciones son inmutables desde el cliente: solo SELECT (la API las
  // escribe con el cliente de servicio tras validar el dispositivo).
  registros_asistencia: {
    select: (p) => (p.rol === "super_admin" ? TODO : filtroEmpresa(p)),
  },
  dispositivos: {
    select: (p) => filtroEmpresa(p),
    insert: (p, fila) => p.rol === "admin_empresa" && fila.empresa_id === p.empresa_id,
    update: (p) => (p.rol === "admin_empresa" ? filtroEmpresa(p) : NADA),
    delete: (p) => (p.rol === "admin_empresa" ? filtroEmpresa(p) : NADA),
  },
  // Altas/cambios solo vía backend (servicio): evita auto-escalamiento.
  usuarios_admin: {
    select: (p, uid) =>
      p.rol === "super_admin"
        ? TODO
        : {
            tipo: "filtro",
            sql: `("auth_user_id" = ? or "empresa_id" = ?)`,
            params: [uid, p.empresa_id],
          },
  },
  // Evidencia legal: se crea, jamás se edita ni borra desde el cliente.
  consentimientos: {
    select: (p) => filtroEmpresa(p),
    insert: (p, fila) => esGestor(p.rol) && fila.empresa_id === p.empresa_id,
  },
  // Bitácora inmutable: INSERT y SELECT de la propia empresa.
  auditoria: {
    select: (p) => (p.rol === "super_admin" ? TODO : filtroEmpresa(p)),
    insert: (p, fila) => fila.empresa_id === p.empresa_id,
  },
};

function perfilActivo(authUserId: string): Perfil | null {
  const fila = obtenerDb()
    .prepare(
      "select id, empresa_id, rol from usuarios_admin where auth_user_id = ? and activo = 1 limit 1",
    )
    .get(authUserId) as Perfil | undefined;
  return fila ?? null;
}

// ---------------------------------------------------------------------------
// Conversión de valores SQLite ↔ JS (igual que los tipos de Postgres)
// ---------------------------------------------------------------------------

function aSqlite(tabla: string, col: string, valor: unknown): unknown {
  const meta = TABLAS[tabla];
  if (valor === undefined) return null;
  if (typeof valor === "boolean") return valor ? 1 : 0;
  if (meta?.json.includes(col) && valor !== null && typeof valor === "object") {
    return JSON.stringify(valor);
  }
  if (
    meta?.horas.includes(col) &&
    typeof valor === "string" &&
    /^\d{2}:\d{2}$/.test(valor)
  ) {
    return `${valor}:00`; // Postgres normaliza time a HH:MM:SS
  }
  return valor;
}

function filaAJs(tabla: string, fila: Record<string, unknown>): Record<string, unknown> {
  const meta = TABLAS[tabla];
  const salida: Record<string, unknown> = { ...fila };
  for (const col of meta?.booleanas ?? []) {
    if (col in salida && salida[col] !== null) salida[col] = Boolean(salida[col]);
  }
  for (const col of meta?.json ?? []) {
    if (typeof salida[col] === "string") {
      try {
        salida[col] = JSON.parse(salida[col] as string);
      } catch {
        /* se deja tal cual */
      }
    }
  }
  return salida;
}

function mapearError(e: unknown): ErrorPg {
  const message = e instanceof Error ? e.message : String(e);
  let code = "XX000";
  if (message.includes("UNIQUE constraint failed")) code = "23505";
  else if (message.includes("FOREIGN KEY constraint failed")) code = "23503";
  else if (message.includes("CHECK constraint failed")) code = "23514";
  else if (message.includes("NOT NULL constraint failed")) code = "23502";
  return { message, code, details: null, hint: null };
}

const ERROR_RLS: ErrorPg = {
  message: "new row violates row-level security policy",
  code: "42501",
  details: null,
  hint: null,
};

function validarIdentificador(nombre: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nombre)) {
    throw new Error(`Identificador inválido: ${nombre}`);
  }
  return nombre;
}

// ---------------------------------------------------------------------------
// Parser del string de select() — columnas base + relaciones embebidas
// ---------------------------------------------------------------------------

type Seleccion = {
  todas: boolean;
  columnas: string[];
  relaciones: { tabla: string; columnas: string[] }[];
};

function parseSeleccion(texto: string): Seleccion {
  const limpio = texto.replace(/\s+/g, "");
  const partes: string[] = [];
  let profundidad = 0;
  let actual = "";
  for (const ch of limpio) {
    if (ch === "(") profundidad++;
    if (ch === ")") profundidad--;
    if (ch === "," && profundidad === 0) {
      partes.push(actual);
      actual = "";
    } else {
      actual += ch;
    }
  }
  if (actual) partes.push(actual);

  const seleccion: Seleccion = { todas: false, columnas: [], relaciones: [] };
  for (const parte of partes) {
    const rel = parte.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
    if (rel) {
      seleccion.relaciones.push({
        tabla: validarIdentificador(rel[1]),
        columnas: rel[2] === "*" || rel[2] === "" ? ["*"] : rel[2].split(",").map(validarIdentificador),
      });
    } else if (parte === "*") {
      seleccion.todas = true;
    } else if (parte) {
      seleccion.columnas.push(validarIdentificador(parte));
    }
  }
  return seleccion;
}

function proyectar(
  fila: Record<string, unknown>,
  seleccion: Seleccion,
): Record<string, unknown> {
  if (seleccion.todas) return fila;
  const salida: Record<string, unknown> = {};
  for (const col of seleccion.columnas) salida[col] = fila[col] ?? null;
  return salida;
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

type Filtro = { col: string; op: string; valor: unknown };

export class ConsultaLocal implements PromiseLike<Resultado> {
  private accion: "select" | "insert" | "update" | "delete" = "select";
  private textoSeleccion = "*";
  private valores: Record<string, unknown>[] = [];
  private filtros: Filtro[] = [];
  private ordenes: { col: string; asc: boolean }[] = [];
  private limite: number | null = null;
  private modoUnico: "single" | "maybe" | null = null;
  private contar = false;
  private soloConteo = false;
  private regresarFilas = false;

  constructor(
    private tabla: string,
    private resolverContexto: () => Contexto,
  ) {
    validarIdentificador(tabla);
  }

  select(
    columnas = "*",
    opciones?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): this {
    this.textoSeleccion = columnas;
    if (this.accion !== "select") this.regresarFilas = true;
    if (opciones?.count) this.contar = true;
    if (opciones?.head) this.soloConteo = true;
    return this;
  }

  insert(valores: Record<string, unknown> | Record<string, unknown>[]): this {
    this.accion = "insert";
    this.valores = Array.isArray(valores) ? valores : [valores];
    return this;
  }

  update(valores: Record<string, unknown>): this {
    this.accion = "update";
    this.valores = [valores];
    return this;
  }

  delete(): this {
    this.accion = "delete";
    return this;
  }

  private filtro(col: string, op: string, valor: unknown): this {
    this.filtros.push({ col: validarIdentificador(col), op, valor });
    return this;
  }

  eq(col: string, valor: unknown): this {
    return this.filtro(col, "=", valor);
  }
  neq(col: string, valor: unknown): this {
    return this.filtro(col, "!=", valor);
  }
  gt(col: string, valor: unknown): this {
    return this.filtro(col, ">", valor);
  }
  gte(col: string, valor: unknown): this {
    return this.filtro(col, ">=", valor);
  }
  lt(col: string, valor: unknown): this {
    return this.filtro(col, "<", valor);
  }
  lte(col: string, valor: unknown): this {
    return this.filtro(col, "<=", valor);
  }
  like(col: string, patron: string): this {
    return this.filtro(col, "like", patron);
  }
  is(col: string, valor: null | boolean): this {
    return this.filtro(col, "is", valor);
  }
  in(col: string, valores: unknown[]): this {
    return this.filtro(col, "in", valores);
  }

  order(col: string, opciones?: { ascending?: boolean }): this {
    this.ordenes.push({
      col: validarIdentificador(col),
      asc: opciones?.ascending ?? true,
    });
    return this;
  }

  limit(n: number): this {
    if (Number.isFinite(n) && n >= 0) this.limite = Math.floor(n);
    return this;
  }

  single<T = Fila>(): PromiseLike<Resultado<T | null>> {
    this.modoUnico = "single";
    return this as PromiseLike<Resultado<T | null>>;
  }

  maybeSingle<T = Fila>(): PromiseLike<Resultado<T | null>> {
    this.modoUnico = "maybe";
    return this as PromiseLike<Resultado<T | null>>;
  }

  then<A = Resultado, B = never>(
    onfulfilled?: ((valor: Resultado) => A | PromiseLike<A>) | null,
    onrejected?: ((razon: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.ejecutar())
      .then(onfulfilled, onrejected);
  }

  // -- Ejecución -------------------------------------------------------------

  private alcance(
    accion: "select" | "update" | "delete",
    tabla: string = this.tabla,
  ): Alcance {
    const ctx = this.resolverContexto();
    if (ctx.tipo === "service") return TODO;
    if (ctx.tipo === "anon") return NADA;
    const perfil = perfilActivo(ctx.authUserId);
    if (!perfil) return NADA;
    const regla = POLITICAS[tabla]?.[accion];
    if (!regla) return NADA;
    return regla(perfil, ctx.authUserId);
  }

  /**
   * Emulación del WITH CHECK de las políticas de UPDATE: la fila resultante
   * debe seguir perteneciendo a la empresa del usuario. Sin esto, un admin
   * podría "mover" filas propias a otro tenant cambiando empresa_id.
   */
  private violaWithCheck(cambios: Record<string, unknown>): boolean {
    const ctx = this.resolverContexto();
    if (ctx.tipo === "service") return false;
    const perfil = ctx.tipo === "usuario" ? perfilActivo(ctx.authUserId) : null;
    const columnaTenant = this.tabla === "empresas" ? "id" : "empresa_id";
    return (
      columnaTenant in cambios && cambios[columnaTenant] !== perfil?.empresa_id
    );
  }

  private permitirInsercion(fila: Record<string, unknown>): boolean {
    const ctx = this.resolverContexto();
    if (ctx.tipo === "service") return true;
    if (ctx.tipo === "anon") return false;
    const perfil = perfilActivo(ctx.authUserId);
    if (!perfil) return false;
    const regla = POLITICAS[this.tabla]?.insert;
    return regla ? regla(perfil, fila) : false;
  }

  private condicionesSql(alcance: Alcance): { sql: string; params: unknown[] } {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    for (const f of this.filtros) {
      if (f.op === "in") {
        const lista = f.valor as unknown[];
        if (lista.length === 0) {
          condiciones.push("1 = 0");
          continue;
        }
        condiciones.push(
          `"${f.col}" in (${lista.map(() => "?").join(", ")})`,
        );
        params.push(...lista.map((v) => aSqlite(this.tabla, f.col, v)));
      } else if (f.op === "is") {
        if (f.valor === null) condiciones.push(`"${f.col}" is null`);
        else {
          condiciones.push(`"${f.col}" = ?`);
          params.push(f.valor ? 1 : 0);
        }
      } else {
        condiciones.push(`"${f.col}" ${f.op} ?`);
        params.push(aSqlite(this.tabla, f.col, f.valor));
      }
    }
    if (alcance.tipo === "nada") condiciones.push("1 = 0");
    if (alcance.tipo === "filtro") {
      condiciones.push(alcance.sql);
      params.push(...alcance.params);
    }
    return {
      sql: condiciones.length ? ` where ${condiciones.join(" and ")}` : "",
      params,
    };
  }

  private anexarRelaciones(
    filas: Record<string, unknown>[],
    seleccion: Seleccion,
  ): void {
    const db = obtenerDb();
    for (const rel of seleccion.relaciones) {
      const fk = FK_RELACIONES[rel.tabla];
      if (!fk || !TABLAS[rel.tabla]) {
        throw new Error(
          `Relación embebida no soportada: ${this.tabla} → ${rel.tabla}`,
        );
      }
      // La fila embebida también respeta el alcance RLS de SU tabla (igual
      // que en PostgREST): fuera de alcance ⇒ null, aunque la FK exista.
      const alcanceRel = this.alcance("select", rel.tabla);
      if (alcanceRel.tipo === "nada") {
        for (const fila of filas) fila[rel.tabla] = null;
        continue;
      }
      const extra =
        alcanceRel.tipo === "filtro" ? ` and (${alcanceRel.sql})` : "";
      const paramsRel = alcanceRel.tipo === "filtro" ? alcanceRel.params : [];
      const stmt = db.prepare(
        `select * from "${rel.tabla}" where "id" = ?${extra}`,
      );
      for (const fila of filas) {
        const idRelacion = fila[fk];
        if (idRelacion == null) {
          fila[rel.tabla] = null;
          continue;
        }
        const cruda = stmt.get(
          ...([idRelacion, ...paramsRel] as string[]),
        ) as Record<string, unknown> | undefined;
        if (!cruda) {
          fila[rel.tabla] = null;
          continue;
        }
        const convertida = filaAJs(rel.tabla, cruda);
        fila[rel.tabla] = rel.columnas.includes("*")
          ? convertida
          : Object.fromEntries(
              rel.columnas.map((c) => [c, convertida[c] ?? null]),
            );
      }
    }
  }

  private aplicarModoUnico(filas: Fila[]): Resultado {
    if (this.modoUnico === "single") {
      if (filas.length !== 1) {
        return {
          data: null,
          error: {
            message: `JSON object requested, multiple (or no) rows returned (${filas.length})`,
            code: "PGRST116",
            details: null,
            hint: null,
          },
          count: null,
        };
      }
      return { data: filas[0], error: null, count: null };
    }
    if (this.modoUnico === "maybe") {
      if (filas.length > 1) {
        return {
          data: null,
          error: {
            message: "JSON object requested, multiple rows returned",
            code: "PGRST116",
            details: null,
            hint: null,
          },
          count: null,
        };
      }
      return { data: filas[0] ?? null, error: null, count: null };
    }
    return { data: filas, error: null, count: null };
  }

  private ejecutar(): Resultado {
    // Solo las tablas "públicas" del esquema existen para from(); auth_users y
    // las tablas internas de SQLite quedan fuera del alcance de CUALQUIER
    // acción y contexto (igual que PostgREST no expone el esquema auth).
    if (!TABLAS[this.tabla]) {
      return {
        data: null,
        error: {
          message: `relation "public.${this.tabla}" does not exist`,
          code: "42P01",
          details: null,
          hint: null,
        },
        count: null,
      };
    }
    try {
      switch (this.accion) {
        case "select":
          return this.ejecutarSelect();
        case "insert":
          return this.ejecutarInsert();
        case "update":
          return this.ejecutarUpdateDelete("update");
        case "delete":
          return this.ejecutarUpdateDelete("delete");
      }
    } catch (e) {
      return { data: null, error: mapearError(e), count: null };
    }
  }

  private ejecutarSelect(): Resultado {
    const db = obtenerDb();
    const alcance = this.alcance("select");
    const { sql: donde, params } = this.condicionesSql(alcance);

    let count: number | null = null;
    if (this.contar) {
      const fila = db
        .prepare(`select count(*) as n from "${this.tabla}"${donde}`)
        .get(...(params as string[])) as { n: number };
      count = fila.n;
    }
    if (this.soloConteo) return { data: null, error: null, count };

    let sql = `select * from "${this.tabla}"${donde}`;
    if (this.ordenes.length) {
      sql += ` order by ${this.ordenes
        .map((o) => `"${o.col}" ${o.asc ? "asc" : "desc"}`)
        .join(", ")}`;
    }
    if (this.limite !== null) sql += ` limit ${Math.floor(this.limite)}`;

    const crudas = db.prepare(sql).all(...(params as string[])) as Record<
      string,
      unknown
    >[];
    const seleccion = parseSeleccion(this.textoSeleccion);
    const convertidas = crudas.map((f) => filaAJs(this.tabla, f));
    this.anexarRelaciones(convertidas, seleccion);
    const filas = convertidas.map((f) => {
      const base = proyectar(f, seleccion);
      for (const rel of seleccion.relaciones) base[rel.tabla] = f[rel.tabla];
      return base;
    });

    const resultado = this.aplicarModoUnico(filas);
    return { ...resultado, count };
  }

  private ejecutarInsert(): Resultado {
    const db = obtenerDb();
    const meta = TABLAS[this.tabla];
    const insertadas: Record<string, unknown>[] = [];

    for (const original of this.valores) {
      if (!this.permitirInsercion(original)) {
        return { data: null, error: ERROR_RLS, count: null };
      }
      const fila: Record<string, unknown> = {};
      for (const [col, valor] of Object.entries(original)) {
        if (valor === undefined) continue;
        fila[validarIdentificador(col)] = aSqlite(this.tabla, col, valor);
      }
      if (meta?.idUuid && fila.id == null) fila.id = randomUUID();

      const columnas = Object.keys(fila);
      const sql = `insert into "${this.tabla}" (${columnas
        .map((c) => `"${c}"`)
        .join(", ")}) values (${columnas.map(() => "?").join(", ")}) returning *`;
      const cruda = db
        .prepare(sql)
        .get(...(Object.values(fila) as string[])) as Record<string, unknown>;
      insertadas.push(filaAJs(this.tabla, cruda));
    }

    if (!this.regresarFilas) return { data: null, error: null, count: null };
    const seleccion = parseSeleccion(this.textoSeleccion);
    this.anexarRelaciones(insertadas, seleccion);
    return this.aplicarModoUnico(insertadas.map((f) => proyectar(f, seleccion)));
  }

  private ejecutarUpdateDelete(accion: "update" | "delete"): Resultado {
    const db = obtenerDb();
    const meta = TABLAS[this.tabla];
    const alcance = this.alcance(accion);
    const { sql: donde, params } = this.condicionesSql(alcance);

    let sql: string;
    const paramsSet: unknown[] = [];
    if (accion === "update") {
      const cambios: Record<string, unknown> = {};
      for (const [col, valor] of Object.entries(this.valores[0] ?? {})) {
        if (valor === undefined) continue;
        cambios[validarIdentificador(col)] = aSqlite(this.tabla, col, valor);
      }
      if (this.violaWithCheck(cambios)) {
        return { data: null, error: ERROR_RLS, count: null };
      }
      if (meta?.conUpdatedAt && !("updated_at" in cambios)) {
        cambios.updated_at = new Date().toISOString();
      }
      const setSql = Object.keys(cambios)
        .map((c) => `"${c}" = ?`)
        .join(", ");
      paramsSet.push(...Object.values(cambios));
      sql = `update "${this.tabla}" set ${setSql}${donde} returning *`;
    } else {
      sql = `delete from "${this.tabla}"${donde} returning *`;
    }

    const crudas = db
      .prepare(sql)
      .all(...([...paramsSet, ...params] as string[])) as Record<
      string,
      unknown
    >[];

    if (!this.regresarFilas) return { data: null, error: null, count: null };
    const seleccion = parseSeleccion(this.textoSeleccion);
    const filas = crudas.map((f) => proyectar(filaAJs(this.tabla, f), seleccion));
    return this.aplicarModoUnico(filas);
  }
}

// ---------------------------------------------------------------------------
// Cliente (from + auth) y fábricas
// ---------------------------------------------------------------------------

type UsuarioAuth = UsuarioLocal;

type ErrorAuth = { message: string; code: string } | null;

export type ClienteLocal = {
  from(tabla: string): ConsultaLocal;
  auth: {
    getUser(): Promise<{ data: { user: UsuarioAuth | null }; error: ErrorAuth }>;
    signInWithPassword(credenciales: {
      email: string;
      password: string;
    }): Promise<{ data: { user: UsuarioAuth | null }; error: ErrorAuth }>;
    signOut(): Promise<{ error: ErrorAuth }>;
    resetPasswordForEmail(
      email: string,
    ): Promise<{ data: object; error: ErrorAuth }>;
    admin: {
      createUser(atributos: {
        email: string;
        password: string;
        email_confirm?: boolean;
      }): Promise<{ data: { user: UsuarioAuth | null }; error: ErrorAuth }>;
      deleteUser(id: string): Promise<{ data: object; error: ErrorAuth }>;
    };
  };
};

function crearCliente(
  contextoFijo: Contexto | null,
  cookies?: AdaptadorCookies,
): ClienteLocal {
  let contexto: Contexto | null = contextoFijo;

  function resolverContexto(): Contexto {
    if (contexto) return contexto;
    // Validación completa: firma + vigencia + la cuenta sigue existiendo y
    // la contraseña no cambió desde que se emitió el token.
    const cuenta = sesionVigente(
      verificarTokenSesion(cookies?.get(COOKIE_SESION)),
    );
    if (cuenta) return { tipo: "usuario", authUserId: cuenta.id };
    return { tipo: "anon" };
  }

  function usuarioActual(): UsuarioAuth | null {
    const ctx = resolverContexto();
    if (ctx.tipo !== "usuario") return null;
    return obtenerCuenta(ctx.authUserId);
  }

  function guardarCookieSesion(valor: string, maxAge: number): void {
    cookies?.set(COOKIE_SESION, valor, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });
  }

  const esServicio = contextoFijo?.tipo === "service";

  return {
    from(tabla: string) {
      return new ConsultaLocal(tabla, resolverContexto);
    },
    auth: {
      async getUser() {
        const user = usuarioActual();
        return { data: { user }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const user = verificarCredenciales(email, password);
        if (!user) {
          return {
            data: { user: null },
            error: {
              message: "Invalid login credentials",
              code: "invalid_credentials",
            },
          };
        }
        guardarCookieSesion(emitirTokenSesion(user), SESION_DIAS * 24 * 60 * 60);
        contexto = { tipo: "usuario", authUserId: user.id };
        return { data: { user }, error: null };
      },
      async signOut() {
        guardarCookieSesion("", 0);
        contexto = { tipo: "anon" };
        return { error: null };
      },
      async resetPasswordForEmail(email: string) {
        // Modo local sin correo saliente: el reinicio se hace desde el propio
        // equipo (ver docs/LOCAL.md). No se revela si el correo existe.
        console.info(
          `[local] resetPasswordForEmail("${email}") ignorado: no hay envío de correo en modo local.`,
        );
        return { data: {}, error: null };
      },
      admin: {
        async createUser({ email, password }) {
          if (!esServicio) {
            return {
              data: { user: null },
              error: {
                message: "auth.admin requiere el cliente de servicio.",
                code: "not_admin",
              },
            };
          }
          const resultado = crearCuenta(email, password);
          return { data: { user: resultado.user }, error: resultado.error };
        },
        async deleteUser(id: string) {
          if (!esServicio) {
            return {
              data: {},
              error: {
                message: "auth.admin requiere el cliente de servicio.",
                code: "not_admin",
              },
            };
          }
          borrarCuenta(id);
          return { data: {}, error: null };
        },
      },
    },
  };
}

/** Cliente de servicio (equivalente a service_role): SOLO backend, salta la emulación RLS. */
export function crearClienteServicio(): ClienteLocal {
  return crearCliente({ tipo: "service" });
}

/** Cliente de sesión: contexto derivado de la cookie ra_session (equivalente a anon key + RLS). */
export function crearClienteSesion(cookies: AdaptadorCookies): ClienteLocal {
  return crearCliente(null, cookies);
}

/** Cliente anónimo sin cookies (pruebas). */
export function crearClienteAnon(): ClienteLocal {
  return crearCliente({ tipo: "anon" });
}

/** Cliente autenticado como una cuenta concreta, sin cookies (pruebas). */
export function crearClienteUsuario(authUserId: string): ClienteLocal {
  return crearCliente({ tipo: "usuario", authUserId });
}
