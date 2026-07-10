/**
 * Tests unitarios de lib/crypto (AES-256-GCM por columna).
 * Corren sin base de datos: `npm run test:unit`.
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CryptoConfigError,
  DecryptionError,
  decryptField,
  decryptNullable,
  encryptField,
  encryptNullable,
} from "@/lib/crypto";

const TEST_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("encryptField / decryptField", () => {
  it("cifra y descifra un CURP de ida y vuelta", () => {
    const curp = "GOMC900101HDFRRL09";
    const payload = encryptField(curp);
    expect(payload).not.toContain(curp);
    expect(decryptField(payload)).toBe(curp);
  });

  it("cifra y descifra un RFC y una fecha de nacimiento", () => {
    for (const valor of ["GOMC900101AB1", "1990-01-01"]) {
      expect(decryptField(encryptField(valor))).toBe(valor);
    }
  });

  it("soporta cadenas vacías y unicode (nombres con acentos)", () => {
    expect(decryptField(encryptField(""))).toBe("");
    const unicode = "José Ñuño Peña — 1985-12-31 ✓";
    expect(decryptField(encryptField(unicode))).toBe(unicode);
  });

  it("produce payloads distintos para el mismo texto (IV aleatorio)", () => {
    const a = encryptField("GOMC900101HDFRRL09");
    const b = encryptField("GOMC900101HDFRRL09");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it("usa el formato versionado v1:<iv>:<tag>:<cipher>", () => {
    const parts = encryptField("dato").split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    // IV de 12 bytes y tag de 16 bytes en base64
    expect(Buffer.from(parts[1], "base64")).toHaveLength(12);
    expect(Buffer.from(parts[2], "base64")).toHaveLength(16);
  });

  it("rechaza un payload alterado (autenticación GCM)", () => {
    const payload = encryptField("GOMC900101HDFRRL09");
    const [v, iv, tag, cipher] = payload.split(":");
    const cipherAlterado = Buffer.from(cipher, "base64");
    cipherAlterado[0] ^= 0xff;
    const manipulado = [v, iv, tag, cipherAlterado.toString("base64")].join(
      ":",
    );
    expect(() => decryptField(manipulado)).toThrow(DecryptionError);
  });

  it("rechaza descifrado con una llave distinta", () => {
    const payload = encryptField("dato-sensible");
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptField(payload)).toThrow(DecryptionError);
  });

  it("rechaza payloads con formato desconocido", () => {
    expect(() => decryptField("texto-plano")).toThrow(DecryptionError);
    expect(() => decryptField("v9:a:b:c")).toThrow(DecryptionError);
  });
});

describe("configuración de la llave", () => {
  it("falla con mensaje claro si ENCRYPTION_KEY no existe", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptField("x")).toThrow(CryptoConfigError);
  });

  it("falla si la llave no mide 32 bytes", () => {
    process.env.ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptField("x")).toThrow(CryptoConfigError);
  });
});

describe("encryptNullable / decryptNullable", () => {
  it("propaga null y cadena vacía como null (columnas opcionales)", () => {
    expect(encryptNullable(null)).toBeNull();
    expect(encryptNullable(undefined)).toBeNull();
    expect(encryptNullable("")).toBeNull();
    expect(decryptNullable(null)).toBeNull();
  });

  it("cifra valores presentes igual que encryptField", () => {
    const payload = encryptNullable("GOMC900101AB1");
    expect(payload).not.toBeNull();
    expect(decryptNullable(payload)).toBe("GOMC900101AB1");
  });
});
