# lib/reportes — módulo de cumplimiento STPS (Fase 4)

La STPS aún no publica el formato oficial completo del registro electrónico de
jornada (sección 2.1 del documento maestro). Este módulo está diseñado para
absorber ese estándar **el día que se publique** con dos movimientos, sin
reescribir nada:

## 1. Agregar o cambiar columnas → `columnas.ts`

`COLUMNAS_ASISTENCIA` es la ÚNICA fuente de verdad de las columnas. La vista
8.5 y TODOS los formatos de exportación (Excel, PDF, CSV) se generan desde esa
lista. Ejemplo — si la STPS exige "Horas extra":

```ts
// columnas.ts
{ clave: "horasExtra", titulo: "Horas extra", ancho: 12, alineacion: "derecha" },
```

…y agregar el dato en `filasAsistencia()`. Listo: aparece en la tabla y en las
tres exportaciones. Hay un test que demuestra exactamente este flujo
(`tests/reportes-stps.test.ts` → "extensibilidad de columnas").

## 2. Agregar un formato nuevo → `adaptadores/`

Cada formato implementa la interfaz `AdaptadorExportacion` (`tipos.ts`):

```ts
export const adaptadorStpsXml: AdaptadorExportacion = {
  formato: "stps-xml",
  extension: "xml",
  mimeType: "application/xml",
  async generar(doc) {
    /* layout que publique la STPS */
  },
};
```

y se registra en `adaptadores/index.ts`. La ruta de exportación y los botones
de la vista lo descubren solos.

## Reglas del módulo

- **Ninguna exportación sin auditoría**: la ruta inserta el registro en
  `auditoria` (`reporte.exportacion`: quién, periodo, formato, nº de
  empleados) ANTES de generar el archivo; si la auditoría falla, la
  exportación se cancela. Las consultas de la vista también se auditan
  (`reporte.consulta`).
- Todo documento exportado lleva impreso quién lo generó y cuándo
  (trazabilidad como evidencia ante una inspección).

## Alertas de jornada

`lib/asistencia/jornada.ts` implementa la reducción gradual de la reforma:
48 h (≤2026), 46 h (2027), 44 h (2028), 42 h (2029), 40 h (≥2030). El
dashboard alerta desde el 90% del límite semanal (ámbar) y marca en rojo a
quien lo excede. La decisión sobre qué hacer siempre es humana (sección 2.3).
