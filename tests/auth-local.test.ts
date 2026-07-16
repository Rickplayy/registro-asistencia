/**
 * Pruebas de seguridad de la autenticación local (lib/local/auth + client):
 * política de contraseñas, anti fuerza bruta, integridad del token de sesión
 * e invalidación de sesiones (cambio de contraseña / cuenta borrada).
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  crearCuenta,
  verificarCredenciales,
  emitirTokenSesion,
  verificarTokenSesion,
  sesionVigente,
  COOKIE_SESION,
} from "@/lib/local/auth";
import { obtenerDb } from "@/lib/local/database";
import { crearClienteSesion, type AdaptadorCookies } from "@/lib/local/client";

const PASSWORD = "Password-Segura-123!";

function correoUnico(prefijo: string): string {
  return `${prefijo}-${randomUUID().slice(0, 8)}@example.com`;
}

/** Jarra de cookies en memoria con la misma interfaz que usa lib/db/server. */
function jarra(): AdaptadorCookies & { valores: Map<string, string> } {
  const valores = new Map<string, string>();
  return {
    valores,
    get: (n) => valores.get(n),
    set: (n, v, opts) => {
      if (opts.maxAge === 0) valores.delete(n);
      else valores.set(n, v);
    },
  };
}

describe("Cuentas locales", () => {
  it("rechaza contraseñas menores a 8 caracteres", () => {
    const { user, error } = crearCuenta(correoUnico("corta"), "1234567");
    expect(user).toBeNull();
    expect(error?.code).toBe("weak_password");
  });

  it("rechaza correos duplicados (insensible a mayúsculas)", () => {
    const correo = correoUnico("dup");
    expect(crearCuenta(correo, PASSWORD).error).toBeNull();
    const { error } = crearCuenta(correo.toUpperCase(), PASSWORD);
    expect(error?.code).toBe("email_exists");
  });

  it("acepta credenciales válidas y rechaza contraseña incorrecta", () => {
    const correo = correoUnico("login");
    crearCuenta(correo, PASSWORD);
    expect(verificarCredenciales(correo, PASSWORD)?.email).toBe(correo);
    expect(verificarCredenciales(correo, "otra-cosa-123")).toBeNull();
  });

  it("bloquea el correo tras 5 intentos fallidos (aunque luego acierte)", () => {
    const correo = correoUnico("bruta");
    crearCuenta(correo, PASSWORD);
    for (let i = 0; i < 5; i++) {
      expect(verificarCredenciales(correo, `mala-${i}xxxx`)).toBeNull();
    }
    // Contraseña CORRECTA, pero el correo ya está bloqueado temporalmente.
    expect(verificarCredenciales(correo, PASSWORD)).toBeNull();
  });
});

describe("Tokens de sesión", () => {
  function cuentaConToken() {
    const correo = correoUnico("token");
    const { user } = crearCuenta(correo, PASSWORD);
    return { user: user!, token: emitirTokenSesion(user!) };
  }

  it("un token firmado válido pasa; uno alterado no", () => {
    const { user, token } = cuentaConToken();
    expect(verificarTokenSesion(token)?.id).toBe(user.id);

    // Alterar el payload (cambiar el sub) invalida la firma.
    const [payload, firma] = token.split(".");
    const alterado = Buffer.from(payload, "base64url").toString("utf8");
    const otroPayload = Buffer.from(
      alterado.replace(user.id, randomUUID()),
    ).toString("base64url");
    expect(verificarTokenSesion(`${otroPayload}.${firma}`)).toBeNull();
    // Alterar la firma también.
    expect(verificarTokenSesion(`${payload}.${firma.slice(0, -2)}xx`)).toBeNull();
  });

  it("cambiar la contraseña invalida las sesiones ya emitidas", () => {
    const { user, token } = cuentaConToken();
    expect(sesionVigente(verificarTokenSesion(token))?.id).toBe(user.id);

    obtenerDb()
      .prepare("update auth_users set password_hash = ? where id = ?")
      .run("scrypt$otro$hash", user.id);

    expect(sesionVigente(verificarTokenSesion(token))).toBeNull();
  });

  it("borrar la cuenta invalida la sesión", () => {
    const { user, token } = cuentaConToken();
    obtenerDb().prepare("delete from auth_users where id = ?").run(user.id);
    expect(sesionVigente(verificarTokenSesion(token))).toBeNull();
  });
});

describe("Cliente de sesión (cookies)", () => {
  it("signInWithPassword deja cookie httpOnly y getUser regresa la cuenta", async () => {
    const correo = correoUnico("sesion");
    crearCuenta(correo, PASSWORD);

    const cookies = jarra();
    const cliente = crearClienteSesion(cookies);
    const { error } = await cliente.auth.signInWithPassword({
      email: correo,
      password: PASSWORD,
    });
    expect(error).toBeNull();
    expect(cookies.valores.has(COOKIE_SESION)).toBe(true);

    // Un cliente nuevo (otra petición) reconstruye la sesión desde la cookie.
    const otroCliente = crearClienteSesion(cookies);
    const { data } = await otroCliente.auth.getUser();
    expect(data.user?.email).toBe(correo);
  });

  it("con cookie alterada el usuario es anónimo (y no ve datos)", async () => {
    const correo = correoUnico("falso");
    crearCuenta(correo, PASSWORD);

    const cookies = jarra();
    const cliente = crearClienteSesion(cookies);
    await cliente.auth.signInWithPassword({ email: correo, password: PASSWORD });
    cookies.valores.set(COOKIE_SESION, cookies.valores.get(COOKIE_SESION)! + "x");

    const otroCliente = crearClienteSesion(cookies);
    const { data } = await otroCliente.auth.getUser();
    expect(data.user).toBeNull();

    const { data: empresas } = await otroCliente.from("empresas").select("id");
    expect(empresas).toEqual([]);
  });

  it("signOut borra la cookie", async () => {
    const correo = correoUnico("salir");
    crearCuenta(correo, PASSWORD);

    const cookies = jarra();
    const cliente = crearClienteSesion(cookies);
    await cliente.auth.signInWithPassword({ email: correo, password: PASSWORD });
    await cliente.auth.signOut();
    expect(cookies.valores.has(COOKIE_SESION)).toBe(false);
  });
});
