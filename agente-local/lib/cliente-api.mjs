/**
 * Cliente HTTP del agente local → API central.
 *
 * REGLA (sección 6): la comunicación siempre viaja por TLS. Este cliente
 * exige TLS 1.3 como versión mínima y se niega a usar http:// salvo que se
 * habilite explícitamente para desarrollo local (AGENTE_PERMITIR_HTTP=1).
 *
 * Sin dependencias externas: solo node:https / node:http.
 */
import http from "node:http";
import https from "node:https";

/**
 * Contrato del evento de asistencia (el mismo que usa el kiosko web).
 * @param {{ numeroEmpleado: string, eventoId?: string | null }} datos
 */
export function construirEvento({ numeroEmpleado, eventoId = null }) {
  if (!numeroEmpleado || typeof numeroEmpleado !== "string") {
    throw new Error("numeroEmpleado es obligatorio (string).");
  }
  return {
    numero_empleado: numeroEmpleado,
    evento_id: eventoId ?? null,
  };
}

/**
 * Envía un evento de asistencia a la API central.
 *
 * @param {object} cfg  { apiUrl, apiKey, permitirHttp }
 * @param {object} evento  resultado de construirEvento()
 * @returns {Promise<{status: number, body: any}>}
 */
export function enviarEvento(cfg, evento) {
  const url = new URL("/api/agente/checkin", cfg.apiUrl);

  if (url.protocol !== "https:" && !cfg.permitirHttp) {
    return Promise.reject(
      new Error(
        "La API debe ser https:// (TLS 1.3). Usa AGENTE_PERMITIR_HTTP=1 solo en desarrollo.",
      ),
    );
  }

  const payload = JSON.stringify(evento);
  const opciones = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "x-api-key": cfg.apiKey,
    },
    // TLS 1.3 mínimo cuando el transporte es https.
    ...(url.protocol === "https:" ? { minVersion: "TLSv1.3" } : {}),
  };

  const transporte = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transporte.request(url, opciones, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let body = null;
        try {
          body = JSON.parse(data);
        } catch {
          body = { raw: data };
        }
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("timeout")));
    req.write(payload);
    req.end();
  });
}

/**
 * Envía con reintentos (para cortes de red del sitio del cliente).
 * Reintenta solo errores de red y 5xx; un 4xx es definitivo.
 */
export async function enviarConReintentos(cfg, evento, intentos = 3) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await enviarEvento(cfg, evento);
      if (res.status < 500) return res;
      ultimoError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      ultimoError = e;
    }
    // Espera exponencial: 1s, 2s, 4s…
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw ultimoError;
}
