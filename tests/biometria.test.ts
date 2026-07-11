/**
 * Tests unitarios de lib/biometria (Fase 2 — reconocimiento facial).
 * Corren sin base de datos: `npm run test:unit`.
 *
 * Incluye la prueba explícita del criterio de fase: por diseño es IMPOSIBLE
 * que una imagen cruda pase la validación y llegue a persistirse — solo
 * descriptores de 128 números finitos.
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptField, encryptField } from "@/lib/crypto";
import {
  CAPTURAS_ENROLAMIENTO,
  DIMENSION_PLANTILLA,
  UMBRAL_DISTANCIA,
  coinciden,
  deserializarPlantilla,
  distanciaEuclidiana,
  esDescriptorValido,
  mejorCoincidencia,
  promediarDescriptores,
  serializarPlantilla,
} from "@/lib/biometria/plantilla";

const TEST_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

/** Descriptor sintético reproducible con valores en [-0.5, 0.5]. */
function descriptor(semilla = 1): number[] {
  return Array.from(
    { length: DIMENSION_PLANTILLA },
    (_, i) => Math.sin(semilla * 31 + i) / 2,
  );
}

/** Variación pequeña del mismo rostro (ruido < umbral). */
function variacion(base: number[], magnitud = 0.01): number[] {
  return base.map((n, i) =>
    Math.max(-1, Math.min(1, n + magnitud * Math.sin(i * 7))),
  );
}

describe("esDescriptorValido — barrera anti-imagen", () => {
  it("acepta un descriptor de 128 números finitos", () => {
    expect(esDescriptorValido(descriptor())).toBe(true);
  });

  it("rechaza longitudes distintas de 128", () => {
    expect(esDescriptorValido(descriptor().slice(0, 127))).toBe(false);
    expect(esDescriptorValido([...descriptor(), 0.1])).toBe(false);
    expect(esDescriptorValido([])).toBe(false);
  });

  it("rechaza una imagen en base64 / data-URI disfrazada de plantilla", () => {
    const fotoBase64 = randomBytes(64 * 1024).toString("base64");
    expect(esDescriptorValido(fotoBase64)).toBe(false);
    expect(esDescriptorValido(`data:image/png;base64,${fotoBase64}`)).toBe(
      false,
    );
    // Ni siquiera troceada en un arreglo de strings
    expect(esDescriptorValido(fotoBase64.match(/.{1,512}/g))).toBe(false);
  });

  it("rechaza buffers, objetos y arreglos con no-números", () => {
    expect(esDescriptorValido(randomBytes(128))).toBe(false);
    expect(esDescriptorValido({ imagen: "..." })).toBe(false);
    expect(esDescriptorValido(null)).toBe(false);
    const conNaN = descriptor();
    conNaN[5] = NaN;
    expect(esDescriptorValido(conNaN)).toBe(false);
    const conInfinito = descriptor();
    conInfinito[9] = Infinity;
    expect(esDescriptorValido(conInfinito)).toBe(false);
  });

  it("rechaza valores fuera de rango (los descriptores reales son acotados)", () => {
    const fueraDeRango = descriptor();
    fueraDeRango[0] = 255; // típico de bytes de imagen
    expect(esDescriptorValido(fueraDeRango)).toBe(false);
  });
});

describe("serialización de plantillas", () => {
  it("serializa y deserializa de ida y vuelta (precisión 1e-6)", () => {
    const original = descriptor();
    const recuperado = deserializarPlantilla(serializarPlantilla(original));
    recuperado.forEach((n, i) => expect(n).toBeCloseTo(original[i], 5));
  });

  it("se niega a serializar algo que no sea un descriptor", () => {
    expect(() => serializarPlantilla([1, 2, 3])).toThrow();
    expect(() =>
      serializarPlantilla("data:image/jpeg;base64,AAAA" as unknown as number[]),
    ).toThrow();
  });

  it("se niega a deserializar contenido corrupto o ajeno", () => {
    expect(() => deserializarPlantilla("no-es-json")).toThrow();
    expect(() => deserializarPlantilla('{"foto":"..."}')).toThrow();
    expect(() => deserializarPlantilla("[1,2,3]")).toThrow();
  });
});

describe("comparación de descriptores", () => {
  it("distancia 0 consigo mismo; coincide con una variación pequeña", () => {
    const d = descriptor();
    expect(distanciaEuclidiana(d, d)).toBe(0);
    expect(coinciden(d, variacion(d))).toBe(true);
  });

  it("NO coincide con el rostro de otra persona (vector distinto)", () => {
    expect(coinciden(descriptor(1), descriptor(2))).toBe(false);
  });

  it("mejorCoincidencia identifica al empleado correcto entre varios (1:N)", () => {
    const candidatos = [descriptor(1), descriptor(2), descriptor(3)];
    const capturado = variacion(descriptor(2));
    const res = mejorCoincidencia(capturado, candidatos);
    expect(res.indice).toBe(1);
    expect(res.distancia).toBeLessThan(UMBRAL_DISTANCIA);
  });

  it("mejorCoincidencia devuelve -1 si nadie pasa el umbral", () => {
    const res = mejorCoincidencia(descriptor(99), [
      descriptor(1),
      descriptor(2),
    ]);
    expect(res.indice).toBe(-1);
  });

  it("mejorCoincidencia devuelve -1 sin candidatos (nadie enrolado)", () => {
    expect(mejorCoincidencia(descriptor(), []).indice).toBe(-1);
  });
});

describe("promedio de capturas de enrolamiento", () => {
  it("el promedio de varias capturas sigue coincidiendo con cada una", () => {
    const base = descriptor(4);
    const capturas = Array.from({ length: CAPTURAS_ENROLAMIENTO }, (_, i) =>
      variacion(base, 0.005 * (i + 1)),
    );
    const plantilla = promediarDescriptores(capturas);
    for (const c of capturas) expect(coinciden(plantilla, c)).toBe(true);
  });

  it("rechaza listas vacías o con capturas inválidas", () => {
    expect(() => promediarDescriptores([])).toThrow();
    expect(() => promediarDescriptores([[1, 2, 3]])).toThrow();
  });
});

describe("lo que se persiste: SOLO la plantilla cifrada, jamás una imagen", () => {
  it("el payload que va a credenciales_biometricas es v1:<iv>:<tag>:<cipher> y descifra a 128 números", () => {
    // Reproduce exactamente lo que hace enrolarRostro antes del INSERT.
    const capturas = [descriptor(), variacion(descriptor())];
    const payload = encryptField(
      serializarPlantilla(promediarDescriptores(capturas)),
    );

    // Formato cifrado, sin rastro del contenido en claro
    expect(payload.split(":")[0]).toBe("v1");
    expect(payload).not.toContain("data:image");

    // Al descifrar solo hay un descriptor de 128 números: ninguna imagen cabe
    // en este contrato (una foto mínima ocupa miles de bytes y no validaría).
    const plantilla = deserializarPlantilla(decryptField(payload));
    expect(plantilla).toHaveLength(DIMENSION_PLANTILLA);
    plantilla.forEach((n) => {
      expect(typeof n).toBe("number");
      expect(Number.isFinite(n)).toBe(true);
    });
  });

  it("un intento de colar una imagen por el flujo de enrolamiento revienta antes de cifrar", () => {
    const fotoCruda = randomBytes(4096).toString("base64");
    expect(() =>
      serializarPlantilla(fotoCruda as unknown as number[]),
    ).toThrow();
    expect(() =>
      promediarDescriptores([fotoCruda] as unknown as number[][]),
    ).toThrow();
  });
});
