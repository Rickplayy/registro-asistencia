import { NextResponse } from "next/server";

/** Endpoint de salud para monitoreo y verificación de despliegue. */
export function GET() {
  return NextResponse.json({ ok: true, servicio: "registro-asistencia" });
}
