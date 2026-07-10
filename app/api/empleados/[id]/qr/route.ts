/**
 * Imagen SVG del QR rotativo vigente de un empleado.
 * Solo para usuarios administrativos autenticados; el acceso al método pasa
 * por RLS (si el empleado no es de tu empresa, no hay filas).
 * El QR expira solo (TOTP de 30 s): el cliente lo refresca periódicamente.
 */
import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";

import { createClient } from "@/lib/db/server";
import { decryptField } from "@/lib/crypto";
import { generarPayloadQr, segundosRestantesQr } from "@/lib/auth/qr";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: metodo } = await supabase
    .from("metodos_acceso")
    .select("id, valor_hash_o_token")
    .eq("empleado_id", id)
    .eq("tipo", "qr")
    .eq("activo", true)
    .maybeSingle();

  if (!metodo) {
    return NextResponse.json(
      { error: "Empleado sin QR activo" },
      { status: 404 },
    );
  }

  const secreto = decryptField(metodo.valor_hash_o_token);
  const payload = generarPayloadQr(metodo.id, secreto);
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280,
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store, max-age=0",
      "X-Segundos-Restantes": String(segundosRestantesQr()),
    },
  });
}
