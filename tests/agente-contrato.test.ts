/**
 * Contrato de integración del AGENTE LOCAL (Fase 3) probado con un
 * dispositivo simulado: el driver mock emite eventos y un servidor HTTP de
 * prueba hace las veces de la API central, verificando método, ruta, headers
 * (x-api-key) y payload exactos que recibirá el Worker real.
 * Corre sin base de datos: `npm run test:unit`.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// El agente es ESM puro sin dependencias; se importa tal cual.
import {
  construirEvento,
  enviarConReintentos,
  enviarEvento,
} from "../agente-local/lib/cliente-api.mjs";
import { crearDriverMock } from "../agente-local/drivers/mock.mjs";

type Recibido = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
};

let servidor: http.Server;
let baseUrl: string;
const recibidos: Recibido[] = [];
/** Respuestas programadas por el test (FIFO); default 200 ok. */
const respuestas: { status: number; body: unknown }[] = [];

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      recibidos.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: data ? JSON.parse(data) : null,
      });
      const r = respuestas.shift() ?? {
        status: 200,
        body: {
          ok: true,
          empleadoNombre: "Mock",
          tipo: "entrada",
          hora: "09:00",
        },
      };
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const { port } = servidor.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((r) => servidor.close(r));
});

const cfg = () => ({
  apiUrl: baseUrl,
  apiKey: "RA-LECTOR-clave-de-prueba",
  permitirHttp: true, // el servidor de prueba es local; en producción es TLS 1.3
});

describe("construirEvento — contrato del evento de asistencia", () => {
  it("produce el payload exacto del contrato", () => {
    expect(
      construirEvento({ numeroEmpleado: "1001", eventoId: "ev-1" }),
    ).toEqual({ numero_empleado: "1001", evento_id: "ev-1" });
  });

  it("exige numeroEmpleado", () => {
    expect(() => construirEvento({ numeroEmpleado: "" })).toThrow();
    expect(() =>
      construirEvento({ numeroEmpleado: 123 as unknown as string }),
    ).toThrow();
  });
});

describe("enviarEvento — transporte y autenticación", () => {
  it("hace POST a /api/agente/checkin con x-api-key y JSON correctos", async () => {
    recibidos.length = 0;
    const res = await enviarEvento(
      cfg(),
      construirEvento({ numeroEmpleado: "1001", eventoId: "ev-42" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    expect(recibidos).toHaveLength(1);
    const r = recibidos[0];
    expect(r.method).toBe("POST");
    expect(r.url).toBe("/api/agente/checkin");
    expect(r.headers["x-api-key"]).toBe("RA-LECTOR-clave-de-prueba");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.body).toEqual({ numero_empleado: "1001", evento_id: "ev-42" });
  });

  it("REGLA TLS: rechaza http:// si no se permite explícitamente (solo dev)", async () => {
    await expect(
      enviarEvento(
        { ...cfg(), permitirHttp: false },
        construirEvento({ numeroEmpleado: "1001" }),
      ),
    ).rejects.toThrow(/https/i);
  });
});

describe("enviarConReintentos — resiliencia del sitio del cliente", () => {
  it("reintenta en 5xx y entrega al recuperarse", async () => {
    recibidos.length = 0;
    respuestas.push({ status: 503, body: { error: "mantenimiento" } });
    const res = await enviarConReintentos(
      cfg(),
      construirEvento({ numeroEmpleado: "1002" }),
      2,
    );
    expect(res.status).toBe(200);
    expect(recibidos).toHaveLength(2); // 503 + reintento exitoso
  }, 15_000);

  it("un 4xx es definitivo: NO reintenta (evento rechazado por negocio)", async () => {
    recibidos.length = 0;
    respuestas.push({
      status: 422,
      body: { error: "Empleado no reconocido." },
    });
    const res = await enviarConReintentos(
      cfg(),
      construirEvento({ numeroEmpleado: "9999" }),
      3,
    );
    expect(res.status).toBe(422);
    expect(recibidos).toHaveLength(1);
  });
});

describe("driver mock — dispositivo simulado de punta a punta", () => {
  it("emite el evento como lo hará un lector real y llega al servidor", async () => {
    recibidos.length = 0;
    const driver = crearDriverMock({ interactivo: false });

    const entregado = new Promise<void>((resolve, reject) => {
      driver.simularMarcacion(
        async ({
          numeroEmpleado,
          eventoId,
        }: {
          numeroEmpleado: string;
          eventoId: string;
        }) => {
          try {
            const res = await enviarConReintentos(
              cfg(),
              construirEvento({ numeroEmpleado, eventoId }),
            );
            expect(res.status).toBe(200);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        "1001",
      );
    });
    await entregado;

    expect(recibidos).toHaveLength(1);
    const body = recibidos[0].body as {
      numero_empleado: string;
      evento_id: string;
    };
    expect(body.numero_empleado).toBe("1001");
    expect(body.evento_id).toMatch(/^[0-9a-f-]{36}$/); // uuid del evento en la "terminal"
  });
});
