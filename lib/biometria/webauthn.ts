/**
 * Huella digital vía WebAuthn (Fase 3) — solo servidor.
 *
 * Cómo cumple la regla inquebrantable "el servidor nunca recibe ni almacena
 * un dato de huella crudo":
 *  - La huella la verifica el AUTENTICADOR del dispositivo (Windows Hello,
 *    Touch ID, sensor Android). Al servidor solo llegan: en el enrolamiento,
 *    la clave PÚBLICA del passkey; en el check-in, una aserción firmada.
 *  - Aquí solo se generan retos, se verifican firmas (@simplewebauthn/server)
 *    y se guardan claves públicas en `credenciales_webauthn`.
 *
 * El reto (challenge) viaja en una cookie httpOnly CIFRADA (lib/crypto) con
 * caducidad corta: el kiosko no tiene sesión de Supabase y así el reto queda
 * amarrado al aparato que lo pidió sin necesitar una tabla de retos.
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

import { createAdminClient } from "@/lib/db/admin";
import { decryptField, encryptField } from "@/lib/crypto";
import type {
  DispositivoVinculado,
  EmpleadoMetodo,
} from "@/lib/asistencia/checkin";

export const RP_NOMBRE = "Registro de Asistencia";
/** Vigencia del reto (ms): suficiente para poner el dedo, corta para replay. */
const RETO_TTL_MS = 5 * 60 * 1000;
export const COOKIE_RETO_HUELLA = "ra_reto_huella";

// ----------------------------------------------------------------------------
// Reto en cookie cifrada
// ----------------------------------------------------------------------------

type RetoGuardado = {
  /** 'registro' (enrolamiento) o 'checkin' (aserción). */
  tipo: "registro" | "checkin";
  reto: string;
  /** Solo en registro: empleado ya identificado con su PIN. */
  empleadoId?: string;
  /** Epoch ms de expiración. */
  expira: number;
};

/** Serializa y cifra el reto para guardarlo en la cookie httpOnly. */
export function sellarReto(reto: Omit<RetoGuardado, "expira">): string {
  return encryptField(
    JSON.stringify({ ...reto, expira: Date.now() + RETO_TTL_MS }),
  );
}

/** Descifra y valida el reto de la cookie. Null si falta, expiró o no coincide el tipo. */
export function abrirReto(
  cookieValor: string | undefined,
  tipoEsperado: RetoGuardado["tipo"],
): RetoGuardado | null {
  if (!cookieValor) return null;
  try {
    const reto = JSON.parse(decryptField(cookieValor)) as RetoGuardado;
    if (reto.tipo !== tipoEsperado) return null;
    if (Date.now() > reto.expira) return null;
    return reto;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Enrolamiento (en el kiosko: el passkey se crea en el aparato donde se ficha)
// ----------------------------------------------------------------------------

/** ¿El empleado tiene consentimiento biometrico_huella vigente? (bloqueante) */
export async function tieneConsentimientoHuella(
  empresaId: string,
  empleadoId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("consentimientos")
    .select("id")
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", empresaId)
    .eq("tipo_dato", "biometrico_huella")
    .eq("otorgado", true)
    .is("revocado_en", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function opcionesRegistroHuella(
  dispositivo: DispositivoVinculado,
  empleado: EmpleadoMetodo,
  rpID: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const admin = createAdminClient();
  // Passkeys ya enrolados: evita duplicar la misma credencial en el aparato.
  const { data: existentes } = await admin
    .from("credenciales_webauthn")
    .select("credential_id, transports")
    .eq("empleado_id", empleado.empleadoId)
    .eq("empresa_id", dispositivo.empresaId)
    .eq("vigente", true);

  return generateRegistrationOptions({
    rpName: RP_NOMBRE,
    rpID,
    userName: empleado.empleadoNombre,
    userID: new TextEncoder().encode(empleado.empleadoId),
    userDisplayName: empleado.empleadoNombre,
    attestationType: "none",
    excludeCredentials: (existentes ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as
        | import("@simplewebauthn/server").AuthenticatorTransportFuture[]
        | undefined,
    })),
    authenticatorSelection: {
      // Sensor del propio aparato (no llaves USB externas) + credencial
      // descubrible para que el check-in no necesite teclear nada.
      authenticatorAttachment: "platform",
      residentKey: "required",
      // La verificación del usuario (huella/PIN del SO) es obligatoria:
      // es exactamente lo que sustituye a la plantilla en el servidor.
      userVerification: "required",
    },
  });
}

export type RegistroHuellaResultado =
  { ok: true } | { ok: false; error: string };

export async function confirmarRegistroHuella(
  dispositivo: DispositivoVinculado,
  empleadoId: string,
  respuesta: RegistrationResponseJSON,
  retoEsperado: string,
  origin: string,
  rpID: string,
): Promise<RegistroHuellaResultado> {
  let verificacion;
  try {
    verificacion = await verifyRegistrationResponse({
      response: respuesta,
      expectedChallenge: retoEsperado,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return { ok: false, error: "La credencial no pasó la verificación." };
  }

  if (!verificacion.verified || !verificacion.registrationInfo) {
    return { ok: false, error: "La credencial no pasó la verificación." };
  }

  const { credential } = verificacion.registrationInfo;
  const admin = createAdminClient();
  const { error } = await admin.from("credenciales_webauthn").insert({
    empleado_id: empleadoId,
    empresa_id: dispositivo.empresaId,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    sign_count: credential.counter,
    transports: credential.transports ?? null,
    dispositivo_id: dispositivo.id,
  });
  if (error) {
    const duplicada = error.code === "23505";
    return {
      ok: false,
      error: duplicada
        ? "Esta huella ya estaba enrolada en este aparato."
        : "No se pudo guardar la credencial.",
    };
  }

  // Auditoría de la escritura a nivel de aplicación (el trigger de BD también
  // la registra); el actor es el kiosko, no un admin.
  await admin.from("auditoria").insert({
    usuario_admin_id: null,
    empresa_id: dispositivo.empresaId,
    accion: "biometria.enrolamiento_huella",
    entidad_afectada: "credenciales_webauthn",
    entidad_id: empleadoId,
    detalles: { dispositivo_id: dispositivo.id },
  });

  return { ok: true };
}

// ----------------------------------------------------------------------------
// Check-in (aserción)
// ----------------------------------------------------------------------------

export async function opcionesCheckinHuella(
  rpID: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    // allowCredentials vacío: credencial descubrible — el autenticador
    // identifica al empleado por la huella, sin teclear nada.
    allowCredentials: [],
  });
}

/**
 * Verifica la aserción del kiosko e identifica al empleado.
 * Devuelve null si la firma, el reto, el origen, el consentimiento o el
 * estatus del empleado no cuadran — el kiosko muestra un mensaje único.
 */
export async function verificarCheckinHuella(
  dispositivo: DispositivoVinculado,
  respuesta: AuthenticationResponseJSON,
  retoEsperado: string,
  origin: string,
  rpID: string,
): Promise<EmpleadoMetodo | null> {
  const admin = createAdminClient();

  // La credencial debe existir, estar vigente y ser de la MISMA empresa que
  // el dispositivo (aislamiento multi-tenant también en este flujo).
  const { data: credencial } = await admin
    .from("credenciales_webauthn")
    .select(
      "id, empleado_id, credential_id, public_key, sign_count, transports, empleados(nombre, estatus)",
    )
    .eq("credential_id", respuesta.id)
    .eq("empresa_id", dispositivo.empresaId)
    .eq("vigente", true)
    .maybeSingle();

  // Todo acceso a credenciales queda auditado, haya o no coincidencia.
  const auditarLectura = (coincidencia: boolean) =>
    admin.from("auditoria").insert({
      usuario_admin_id: null,
      empresa_id: dispositivo.empresaId,
      accion: "biometria.verificacion_checkin",
      entidad_afectada: "credenciales_webauthn",
      entidad_id: credencial?.empleado_id ?? null,
      detalles: {
        dispositivo_id: dispositivo.id,
        metodo: "huella",
        coincidencia,
      },
    });

  if (!credencial) {
    await auditarLectura(false);
    return null;
  }

  const emp = credencial.empleados as unknown as {
    nombre: string;
    estatus: string;
  };
  if (emp?.estatus !== "activo") {
    await auditarLectura(false);
    return null;
  }

  // Consentimiento vigente: sin él no se procesa la aserción (sección 9).
  if (
    !(await tieneConsentimientoHuella(
      dispositivo.empresaId,
      credencial.empleado_id,
    ))
  ) {
    await auditarLectura(false);
    return null;
  }

  let verificacion;
  try {
    verificacion = await verifyAuthenticationResponse({
      response: respuesta,
      expectedChallenge: retoEsperado,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credencial.credential_id,
        publicKey: new Uint8Array(
          Buffer.from(credencial.public_key, "base64url"),
        ),
        counter: Number(credencial.sign_count),
        transports: (credencial.transports ?? undefined) as
          | import("@simplewebauthn/server").AuthenticatorTransportFuture[]
          | undefined,
      },
    });
  } catch {
    await auditarLectura(false);
    return null;
  }

  if (!verificacion.verified) {
    await auditarLectura(false);
    return null;
  }

  // Actualiza el contador de firmas (detección de credenciales clonadas).
  await admin
    .from("credenciales_webauthn")
    .update({ sign_count: verificacion.authenticationInfo.newCounter })
    .eq("id", credencial.id);

  await auditarLectura(true);
  return {
    empleadoId: credencial.empleado_id,
    empleadoNombre: emp.nombre,
  };
}
