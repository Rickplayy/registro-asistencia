"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAVEGACION = [
  { href: "/dashboard", etiqueta: "Dashboard" },
  { href: "/empleados", etiqueta: "Empleados" },
  { href: "/reportes", etiqueta: "Reportes" },
  { href: "/dispositivos", etiqueta: "Dispositivos" },
  { href: "/configuracion", etiqueta: "Configuración" },
  { href: "/plan", etiqueta: "Plan y facturación" },
];

const PROXIMAMENTE = [{ etiqueta: "Nómina", fase: "Fase 6" }];

export function Sidebar({ empresaNombre }: { empresaNombre: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-2 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold">
          RA
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            Registro de Asistencia
          </p>
          <p className="truncate text-xs opacity-70">{empresaNombre}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 text-sm">
        {NAVEGACION.map((item) => {
          const activo =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 transition-colors",
                activo
                  ? "bg-sidebar-accent font-medium"
                  : "hover:bg-sidebar-accent/60",
              )}
            >
              {item.etiqueta}
            </Link>
          );
        })}
        {PROXIMAMENTE.map((item) => (
          <span
            key={item.etiqueta}
            className="block cursor-not-allowed rounded-md px-3 py-2 opacity-50"
            title={`Disponible en la ${item.fase}`}
          >
            {item.etiqueta}{" "}
            <span className="text-xs opacity-70">({item.fase})</span>
          </span>
        ))}
      </nav>
      <div className="p-3">
        <Link
          href="/kiosko"
          target="_blank"
          className="block rounded-md border border-sidebar-border px-3 py-2 text-center text-xs opacity-80 transition-colors hover:bg-sidebar-accent/60"
        >
          Abrir kiosko de fichaje ↗
        </Link>
      </div>
    </aside>
  );
}
