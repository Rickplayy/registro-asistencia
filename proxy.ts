/**
 * Proxy (antes middleware): protege las rutas administrativas verificando la
 * firma y vigencia de la cookie de sesión local (chequeo optimista; la
 * validación completa del perfil la hace requerirAdmin en cada vista). El
 * kiosko y el portal del empleado tienen sus propios flujos y NO usan la
 * sesión de admin.
 */
import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_SESION, verificarTokenSesion } from "@/lib/local/auth";

const RUTAS_PUBLICAS = ["/login", "/registro", "/kiosko", "/api/health", "/api/kiosko"];

export default async function proxy(request: NextRequest) {
  const sesion = verificarTokenSesion(
    request.cookies.get(COOKIE_SESION)?.value,
  );

  const { pathname } = request.nextUrl;
  const esRutaPublica = RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );

  if (!sesion && !esRutaPublica && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (sesion && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Todo excepto estáticos e imágenes
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
