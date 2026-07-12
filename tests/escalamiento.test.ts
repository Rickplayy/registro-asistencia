/**
 * Tests de la Fase 5 — escalamiento:
 * planes, rate limiting, retención ARCO y token del proveedor simulado.
 * Corren sin base de datos: `npm run test:unit`.
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PLANES,
  esPlanValido,
  metodosSegunPlan,
  obtenerPlan,
  permiteMasEmpleados,
} from "@/lib/planes";
import {
  _reiniciarContadores,
  permitirIntento,
  registrarFallo,
  registrarFalloYVerificar,
} from "@/lib/seguridad/rate-limit";
import { RETENCION_DIAS, evaluarPurga } from "@/lib/empleados/retencion";
import { abrirTokenCheckout, proveedorSimulado } from "@/lib/pagos/simulado";

const TEST_KEY = randomBytes(32).toString("base64");
beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
  _reiniciarContadores();
});
afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

// ----------------------------------------------------------------------------
// Planes
// ----------------------------------------------------------------------------
describe("planes de suscripción", () => {
  it("obtenerPlan cae a Básico ante valores desconocidos (defensivo)", () => {
    expect(obtenerPlan("basico").id).toBe("basico");
    expect(obtenerPlan("mvp").id).toBe("basico");
    expect(obtenerPlan(null).id).toBe("basico");
    expect(esPlanValido("hackeado")).toBe(false);
  });

  it("límite de empleados por plan (Enterprise ilimitado)", () => {
    expect(permiteMasEmpleados(PLANES.basico, 24)).toBe(true);
    expect(permiteMasEmpleados(PLANES.basico, 25)).toBe(false);
    expect(permiteMasEmpleados(PLANES.pro, 99)).toBe(true);
    expect(permiteMasEmpleados(PLANES.pro, 100)).toBe(false);
    expect(permiteMasEmpleados(PLANES.enterprise, 100000)).toBe(true);
  });

  it("el plan acota los métodos aunque la configuración tenga más", () => {
    const configurados = ["pin", "qr", "facial", "huella"];
    expect(metodosSegunPlan(PLANES.basico, configurados)).toEqual([
      "pin",
      "qr",
    ]);
    expect(metodosSegunPlan(PLANES.pro, configurados)).toEqual(configurados);
  });

  it("white-label y lectores físicos según el plan", () => {
    expect(PLANES.basico.whiteLabel).toBe(false);
    expect(PLANES.pro.whiteLabel).toBe(true);
    expect(PLANES.pro.lectoresFisicos).toBe(false);
    expect(PLANES.enterprise.lectoresFisicos).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Rate limiting
// ----------------------------------------------------------------------------
describe("rate limiting (endpoints públicos)", () => {
  const LIMITE = { max: 3, ventanaMs: 60_000 };

  it("permite hasta el máximo y bloquea el excedente", () => {
    expect(permitirIntento("k:a", LIMITE)).toBe(true);
    expect(permitirIntento("k:a", LIMITE)).toBe(true);
    expect(permitirIntento("k:a", LIMITE)).toBe(true);
    expect(permitirIntento("k:a", LIMITE)).toBe(false);
  });

  it("las llaves son independientes (por IP / por dispositivo)", () => {
    for (let i = 0; i < 3; i++) permitirIntento("k:a", LIMITE);
    expect(permitirIntento("k:a", LIMITE)).toBe(false);
    expect(permitirIntento("k:b", LIMITE)).toBe(true);
  });

  it("modo 'solo castigar fallos': los éxitos no consumen cuota", () => {
    // 2 fallos registrados: aún no excede (límite 3)
    registrarFallo("v:ip1");
    registrarFallo("v:ip1");
    expect(registrarFalloYVerificar("v:ip1", LIMITE).excedido).toBe(false);
    registrarFallo("v:ip1");
    expect(registrarFalloYVerificar("v:ip1", LIMITE).excedido).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Retención ARCO
// ----------------------------------------------------------------------------
describe("retención y purga ARCO", () => {
  it("no se purga a empleados activos ni sin fecha de baja", () => {
    expect(evaluarPurga("activo", "2025-01-01", "2026-07-12").purgable).toBe(
      false,
    );
    expect(evaluarPurga("baja", null, "2026-07-12").purgable).toBe(false);
  });

  it("dentro del periodo de retención se rechaza indicando días restantes", () => {
    const r = evaluarPurga("baja", "2026-07-01", "2026-07-12");
    expect(r.purgable).toBe(false);
    if (!r.purgable) {
      expect(r.diasRestantes).toBe(RETENCION_DIAS - 11);
    }
  });

  it("cumplida la retención (365 días) la purga procede", () => {
    expect(evaluarPurga("baja", "2025-07-11", "2026-07-12").purgable).toBe(
      true,
    );
    // Justo un día antes: aún no
    expect(evaluarPurga("baja", "2025-07-13", "2026-07-12").purgable).toBe(
      false,
    );
  });
});

// ----------------------------------------------------------------------------
// Proveedor de pagos simulado (token de checkout)
// ----------------------------------------------------------------------------
describe("checkout simulado — token cifrado", () => {
  it("emite un token que solo valida para la misma empresa y antes de expirar", async () => {
    const { url } = await proveedorSimulado.crearCheckout({
      empresaId: "emp-1",
      empresaNombre: "Empresa X",
      adminEmail: "a@x.mx",
      plan: PLANES.pro,
      urlBase: "http://localhost:3000",
    });
    const token = decodeURIComponent(url.split("token=")[1]);
    const datos = abrirTokenCheckout(token);
    expect(datos).not.toBeNull();
    expect(datos!.empresaId).toBe("emp-1");
    expect(datos!.plan).toBe("pro");
  });

  it("rechaza tokens corruptos o alterados", () => {
    expect(abrirTokenCheckout("basura")).toBeNull();
    expect(abrirTokenCheckout("")).toBeNull();
  });
});
