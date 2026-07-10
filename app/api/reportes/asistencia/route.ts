/**
 * Exportación del reporte de asistencia: CSV (UTF-8 con BOM) o Excel (.xlsx).
 * Requiere sesión administrativa; los datos salen acotados por RLS.
 */
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/db/server";
import {
  fechaValida,
  inicioDeMes,
  obtenerReporte,
} from "@/lib/asistencia/consultas";
import { reporteACsv } from "@/lib/asistencia/reporte";
import { fechaMx } from "@/lib/asistencia/fechas";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const desde = fechaValida(params.get("desde")) ?? inicioDeMes();
  const hasta = fechaValida(params.get("hasta")) ?? fechaMx();
  const formato = params.get("formato") === "xlsx" ? "xlsx" : "csv";

  const { filas } = await obtenerReporte(desde, hasta);
  const nombreArchivo = `asistencia_${desde}_a_${hasta}`;

  if (formato === "csv") {
    return new NextResponse(reporteACsv(filas), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombreArchivo}.csv"`,
      },
    });
  }

  // Excel: import dinámico para no cargar exceljs en cada request que no exporta.
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Asistencia");

  hoja.columns = [
    { header: "Empleado", key: "nombre", width: 32 },
    { header: "Puesto", key: "puesto", width: 20 },
    { header: "Días trabajados", key: "diasTrabajados", width: 16 },
    { header: "Retardos", key: "retardos", width: 12 },
    { header: "Faltas", key: "faltas", width: 12 },
    { header: "Horas totales", key: "horasTotales", width: 14 },
  ];
  hoja.getRow(1).font = { bold: true };
  filas.forEach((f) => hoja.addRow(f));

  const buffer = await libro.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}.xlsx"`,
    },
  });
}
