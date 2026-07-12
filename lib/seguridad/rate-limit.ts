/**
 * Rate limiting de endpoints públicos (Fase 5) — ventana deslizante en
 * memoria del proceso.
 *
 * Alcance honesto: en despliegues serverless con múltiples instancias cada
 * una lleva su propio contador, así que esto MITIGA abuso (fuerza bruta
 * casual, scripts simples) pero no sustituye un límite distribuido
 * (Cloudflare/Upstash) para ataques coordinados — queda documentado en
 * docs/SEGURIDAD.md. El login administrativo lo limita Supabase Auth en su
 * propio servicio.
 */

type Ventana = { marcas: number[] };

const contadores = new Map<string, Ventana>();

/** Poda global para que la memoria no crezca sin límite. */
const MAX_LLAVES = 10_000;

export type LimiteConfig = {
  /** Máximo de eventos permitidos dentro de la ventana. */
  max: number;
  /** Tamaño de la ventana en milisegundos. */
  ventanaMs: number;
};

/**
 * Registra un intento y decide si se permite.
 * `llave` identifica al actor: `vincular:<ip>`, `checkin:<dispositivoId>`, …
 */
export function permitirIntento(llave: string, config: LimiteConfig): boolean {
  const ahora = Date.now();
  const ventana = contadores.get(llave) ?? { marcas: [] };
  ventana.marcas = ventana.marcas.filter((t) => ahora - t < config.ventanaMs);

  if (ventana.marcas.length >= config.max) {
    contadores.set(llave, ventana);
    return false;
  }

  ventana.marcas.push(ahora);
  contadores.set(llave, ventana);

  if (contadores.size > MAX_LLAVES) {
    // Poda simple: elimina las llaves más viejas (orden de inserción del Map).
    for (const k of contadores.keys()) {
      if (contadores.size <= MAX_LLAVES / 2) break;
      contadores.delete(k);
    }
  }
  return true;
}

/** Solo registra el intento cuando FALLA (para castigar fallos, no éxitos). */
export function registrarFalloYVerificar(
  llave: string,
  config: LimiteConfig,
): { excedido: boolean } {
  const ahora = Date.now();
  const ventana = contadores.get(llave) ?? { marcas: [] };
  ventana.marcas = ventana.marcas.filter((t) => ahora - t < config.ventanaMs);
  contadores.set(llave, ventana);
  return { excedido: ventana.marcas.length >= config.max };
}

export function registrarFallo(llave: string): void {
  const ventana = contadores.get(llave) ?? { marcas: [] };
  ventana.marcas.push(Date.now());
  contadores.set(llave, ventana);
}

/** IP del cliente (primer salto de x-forwarded-for) para llaves por IP. */
export function ipDeRequest(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "sin-ip";
}

/** Solo para tests. */
export function _reiniciarContadores(): void {
  contadores.clear();
}
