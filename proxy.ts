/**
 * Proxy (antes middleware): refresca la sesión de Supabase Auth en cada
 * petición y protege las rutas administrativas. El kiosko y el portal del
 * empleado tienen sus propios flujos y NO usan la sesión de admin.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTAS_PUBLICAS = [
  "/login",
  "/registro",
  "/kiosko",
  "/api/health",
  "/api/kiosko",
  "/api/agente", // autenticado por API key de dispositivo, no por sesión
  "/api/pagos/webhook", // autenticado por firma del proveedor de pagos
];

export default async function proxy(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copia .env.example a .env.local y sigue docs/SETUP.md.",
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: getUser() valida el JWT contra Supabase; no usar getSession() aquí.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esRutaPublica = RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );

  if (!user && !esRutaPublica && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Todo excepto estáticos, imágenes y los modelos de face-api
    // (public/modelos-face): el kiosko los pide SIN sesión (es un dispositivo,
    // no un admin), así que nunca deben pasar por el chequeo de auth — de lo
    // contrario el navegador recibe la redirección a /login como si fuera el
    // JSON del modelo y face-api truena al parsearla.
    "/((?!_next/static|_next/image|favicon.ico|modelos-face/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
