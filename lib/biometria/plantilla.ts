/**
 * Plantilla facial: validación, serialización y comparación.
 *
 * La "plantilla" es el descriptor matemático de 128 dimensiones que produce
 * face-api.js en el NAVEGADOR. La fotografía / frame de video nunca llega al
 * servidor: solo este vector. Aun así, el vector es dato biométrico sensible
 * (LFPDPPP), por lo que se cifra con lib/crypto antes de persistirse.
 *
 * Módulo puro e isomorfo (sin node:crypto): lo usan el cliente (captura),
 * el servidor (enrolamiento/verificación) y los tests.
 */

/** Dimensiones del descriptor de FaceRecognitionNet (face-api.js). */
export const DIMENSION_PLANTILLA = 128;

/**
 * Distancia euclidiana máxima para aceptar que dos descriptores son la misma
 * persona. El estándar de face-api.js es 0.6; usamos 0.5 porque el check-in
 * registra jornada legal: preferimos un falso rechazo (el empleado reintenta
 * o usa PIN) a un falso positivo (registrarle la asistencia a otra persona).
 */
export const UMBRAL_DISTANCIA = 0.5;

/** Número de capturas que se promedian al enrolar (reduce ruido de una sola toma). */
export const CAPTURAS_ENROLAMIENTO = 3;

/**
 * Valida que un valor sea EXACTAMENTE un descriptor facial: un arreglo de 128
 * números finitos acotados. Cualquier otra cosa se rechaza — en particular
 * strings largos (base64/data-URI de una imagen) o buffers: es la barrera que
 * garantiza que jamás se persista una imagen cruda disfrazada de plantilla.
 */
export function esDescriptorValido(valor: unknown): valor is number[] {
  if (!Array.isArray(valor) || valor.length !== DIMENSION_PLANTILLA) {
    return false;
  }
  return valor.every(
    (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1,
  );
}

/** Serializa un descriptor a texto para cifrarlo (JSON compacto, 6 decimales). */
export function serializarPlantilla(descriptor: number[]): string {
  if (!esDescriptorValido(descriptor)) {
    throw new Error(
      `Plantilla inválida: se esperaba un arreglo de ${DIMENSION_PLANTILLA} números finitos.`,
    );
  }
  return JSON.stringify(descriptor.map((n) => Number(n.toFixed(6))));
}

/** Deserializa una plantilla descifrada. Lanza si el contenido no es un descriptor. */
export function deserializarPlantilla(texto: string): number[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(texto);
  } catch {
    throw new Error("Plantilla almacenada corrupta: no es JSON.");
  }
  if (!esDescriptorValido(parsed)) {
    throw new Error(
      "Plantilla almacenada corrupta: no es un descriptor válido.",
    );
  }
  return parsed;
}

/** Distancia euclidiana entre dos descriptores. */
export function distanciaEuclidiana(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Los descriptores deben tener la misma dimensión.");
  }
  let suma = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    suma += d * d;
  }
  return Math.sqrt(suma);
}

/** ¿Dos descriptores corresponden a la misma persona según el umbral? */
export function coinciden(a: number[], b: number[]): boolean {
  return distanciaEuclidiana(a, b) < UMBRAL_DISTANCIA;
}

/** Promedia varias capturas de la misma persona en una sola plantilla estable. */
export function promediarDescriptores(descriptores: number[][]): number[] {
  if (descriptores.length === 0) {
    throw new Error("Se requiere al menos una captura para promediar.");
  }
  for (const d of descriptores) {
    if (!esDescriptorValido(d)) {
      throw new Error("Una de las capturas no es un descriptor válido.");
    }
  }
  const promedio = new Array<number>(DIMENSION_PLANTILLA).fill(0);
  for (const d of descriptores) {
    for (let i = 0; i < DIMENSION_PLANTILLA; i++) promedio[i] += d[i];
  }
  for (let i = 0; i < DIMENSION_PLANTILLA; i++) {
    promedio[i] /= descriptores.length;
  }
  return promedio;
}

export type ResultadoComparacion = {
  /** Índice del mejor candidato en la lista, o -1 si nadie pasa el umbral. */
  indice: number;
  distancia: number;
};

/** Identificación 1:N — devuelve el candidato más cercano bajo el umbral. */
export function mejorCoincidencia(
  capturado: number[],
  candidatos: number[][],
): ResultadoComparacion {
  let mejor: ResultadoComparacion = { indice: -1, distancia: Infinity };
  for (let i = 0; i < candidatos.length; i++) {
    const d = distanciaEuclidiana(capturado, candidatos[i]);
    if (d < mejor.distancia) mejor = { indice: i, distancia: d };
  }
  if (mejor.distancia >= UMBRAL_DISTANCIA) {
    return { indice: -1, distancia: mejor.distancia };
  }
  return mejor;
}
