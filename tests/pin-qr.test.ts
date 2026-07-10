/** Tests de PIN (hash) y QR rotativo (TOTP) — sin base de datos. */
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generarPin, hashPin } from "@/lib/auth/pin";
import {
  generarPayloadQr,
  generarSecretoQr,
  parsearPayloadQr,
  QR_PASO_SEGUNDOS,
  segundosRestantesQr,
  verificarCodigoQr,
} from "@/lib/auth/qr";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("PIN", () => {
  it("genera PINs de 6 dígitos", () => {
    for (let i = 0; i < 20; i++) {
      expect(generarPin()).toMatch(/^\d{6}$/);
    }
  });

  it("el hash es determinista dentro de la misma empresa", () => {
    const empresa = randomUUID();
    expect(hashPin("123456", empresa)).toBe(hashPin("123456", empresa));
  });

  it("el mismo PIN produce hashes distintos en empresas distintas", () => {
    expect(hashPin("123456", randomUUID())).not.toBe(
      hashPin("123456", randomUUID()),
    );
  });

  it("el hash nunca contiene el PIN en claro", () => {
    const h = hashPin("987654", randomUUID());
    expect(h).not.toContain("987654");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rechaza PINs no numéricos o de largo inválido", () => {
    expect(() => hashPin("abc123", randomUUID())).toThrow();
    expect(() => hashPin("123", randomUUID())).toThrow();
  });

  it("falla con mensaje claro sin ENCRYPTION_KEY", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => hashPin("123456", randomUUID())).toThrow(/ENCRYPTION_KEY/);
  });
});

describe("QR rotativo (TOTP)", () => {
  it("genera un payload parseable RA1.<uuid>.<8 dígitos>", () => {
    const metodoId = randomUUID();
    const secreto = generarSecretoQr();
    const payload = generarPayloadQr(metodoId, secreto);
    const parseado = parsearPayloadQr(payload);
    expect(parseado).not.toBeNull();
    expect(parseado!.metodoId).toBe(metodoId);
    expect(parseado!.codigo).toMatch(/^\d{8}$/);
  });

  it("acepta el código vigente y el del paso anterior (tolerancia de reloj)", () => {
    const secreto = generarSecretoQr();
    const ahora = new Date("2026-07-10T12:00:00Z");
    const payload = generarPayloadQr(randomUUID(), secreto, ahora);
    const { codigo } = parsearPayloadQr(payload)!;

    expect(verificarCodigoQr(secreto, codigo, ahora)).toBe(true);
    const unPasoDespues = new Date(ahora.getTime() + QR_PASO_SEGUNDOS * 1000);
    expect(verificarCodigoQr(secreto, codigo, unPasoDespues)).toBe(true);
  });

  it("RECHAZA una foto vieja del código (rotación)", () => {
    const secreto = generarSecretoQr();
    const ahora = new Date("2026-07-10T12:00:00Z");
    const payload = generarPayloadQr(randomUUID(), secreto, ahora);
    const { codigo } = parsearPayloadQr(payload)!;

    const cincoMinDespues = new Date(ahora.getTime() + 5 * 60 * 1000);
    expect(verificarCodigoQr(secreto, codigo, cincoMinDespues)).toBe(false);
  });

  it("rechaza códigos de otro secreto (otro empleado)", () => {
    const ahora = new Date();
    const payload = generarPayloadQr(randomUUID(), generarSecretoQr(), ahora);
    const { codigo } = parsearPayloadQr(payload)!;
    expect(verificarCodigoQr(generarSecretoQr(), codigo, ahora)).toBe(false);
  });

  it("rechaza payloads con formato ajeno", () => {
    expect(parsearPayloadQr("hola")).toBeNull();
    expect(parsearPayloadQr("RA1.no-es-uuid.12345678")).toBeNull();
    expect(parsearPayloadQr(`RA1.${randomUUID()}.abc`)).toBeNull();
    expect(parsearPayloadQr(`OTRO.${randomUUID()}.12345678`)).toBeNull();
  });

  it("los payloads rotan entre pasos de tiempo", () => {
    const metodoId = randomUUID();
    const secreto = generarSecretoQr();
    const t1 = new Date("2026-07-10T12:00:00Z");
    const t2 = new Date(t1.getTime() + QR_PASO_SEGUNDOS * 1000);
    expect(generarPayloadQr(metodoId, secreto, t1)).not.toBe(
      generarPayloadQr(metodoId, secreto, t2),
    );
  });

  it("segundosRestantesQr está en (0, paso]", () => {
    const s = segundosRestantesQr();
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(QR_PASO_SEGUNDOS);
  });
});
