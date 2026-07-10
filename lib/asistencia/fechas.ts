/**
 * Fechas y horas en la zona horaria de referencia del MVP
 * (America/Mexico_City). Zona por sede/empresa: fase posterior.
 */
export const ZONA_MX = "America/Mexico_City";

/** "YYYY-MM-DD" en hora de Ciudad de México. */
export function fechaMx(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_MX,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** "HH:MM:SS" (24 h) en hora de Ciudad de México. */
export function horaMx(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_MX,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(ahora)
    .replace(/^24/, "00");
}

/** Suma minutos a una hora "HH:MM[:SS]" y regresa "HH:MM:SS" (mismo día, tope 23:59:59). */
export function sumarMinutos(hora: string, minutos: number): string {
  const [h, m, s = 0] = hora.split(":").map(Number);
  const total = Math.min(h * 3600 + m * 60 + s + minutos * 60, 86_399);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Diferencia en horas decimales entre dos horas "HH:MM[:SS]" del mismo día (mínimo 0). */
export function horasEntre(inicio: string, fin: string): number {
  const seg = (h: string) => {
    const [hh, mm, ss = 0] = h.split(":").map(Number);
    return hh * 3600 + mm * 60 + ss;
  };
  return Math.max(0, (seg(fin) - seg(inicio)) / 3600);
}

/** Lista de fechas "YYYY-MM-DD" entre dos fechas inclusive. */
export function rangoFechas(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  const fin = new Date(`${hasta}T00:00:00Z`);
  for (
    let d = new Date(`${desde}T00:00:00Z`);
    d <= fin;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    fechas.push(d.toISOString().slice(0, 10));
  }
  return fechas;
}

/** ¿La fecha "YYYY-MM-DD" cae en lunes a viernes? (aprox. de días hábiles del MVP) */
export function esDiaHabil(fecha: string): boolean {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return dia >= 1 && dia <= 5;
}
