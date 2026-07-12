/**
 * Proveedores de pago (Fase 5) — mismo patrón de adaptadores que los reportes.
 *
 * REGLA INQUEBRANTABLE: este sistema JAMÁS ve ni guarda un número de tarjeta.
 * El checkout ocurre en la página hospedada del proveedor certificado
 * (PCI-DSS); aquí solo viajan referencias e IDs.
 */
import type { Plan } from "@/lib/planes";

export type SolicitudCheckout = {
  empresaId: string;
  empresaNombre: string;
  adminEmail: string;
  plan: Plan;
  /** Origen de la app (para las URLs de retorno). */
  urlBase: string;
};

export interface ProveedorPagos {
  id: "simulado" | "stripe";
  /** Crea la sesión de cobro recurrente y regresa la URL a la que redirigir. */
  crearCheckout(solicitud: SolicitudCheckout): Promise<{ url: string }>;
}
