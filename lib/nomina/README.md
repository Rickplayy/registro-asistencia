# lib/nomina — incidencias y proyección de nómina (Fase 6)

Motor de cálculo de incidencias y exportación (sección 11 del documento
maestro). **Proyecta, no timbra ni paga**: la salida es el insumo que el
sistema de nómina o el contador de cada cliente usa para el pago final
(sin ISR, sin IMSS, sin CFDI).

## Piezas

- `calculo.ts` — motor PURO (testeable sin base): horas, extras dobles/
  triples, retardos, faltas, séptimo día, topes legales, prima dominical,
  bonos. Tests de las reglas legales en `tests/nomina.test.ts`.
- `consultas.ts` — arma la proyección desde la base (salario vigente del
  histórico, configuración, bonos y aprobaciones del periodo).
- `actions.ts` — salarios (histórico: el cambio cierra vigencia), política
  por empresa (tope validado ≤30), catálogo de bonos y APROBACIÓN humana.
- `columnas.ts` — columnas de la vista 8.6 y exportaciones (patrón Fase 4).
- Exportación: Excel/CSV con los adaptadores existentes + `sql.ts`
  (script de INSERTs de `incidencias`) en `lib/reportes/adaptadores/`.

## Reglas LFT que el motor IMPONE (no configurables, con test cada una)

| Regla                              | Implementación                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Retardos jamás en pesos (Art. 110) | Solo acumulan a falta si `retardos_antes_de_falta > 0` (reglamento interior).                                                                   |
| Tope de descuento (Art. 110)       | `min(tope_empresa, 30)%` del excedente sobre el salario mínimo del periodo; nunca deja el pago bajo el mínimo. Salario = mínimo ⇒ descuento $0. |
| Séptimo día (Art. 69)              | Cada semana con faltas pierde `faltas/6` del séptimo día (máx. 1 día/semana).                                                                   |
| Horas extra (Arts. 66-68)          | Sobre el límite semanal vigente del año (48h 2026 → 40h 2030): primeras 9 al DOBLE, resto al TRIPLE.                                            |
| Faltas 30 días (Art. 47)           | ≥ umbral (default 3) ⇒ SOLO alerta visual; jamás una acción automática.                                                                         |
| Prima dominical (Art. 71)          | +25% del salario diario por domingo trabajado, si la empresa la activa.                                                                         |

## Revisión humana obligatoria

Los botones de exportación existen ÚNICAMENTE en la vista de proyección
(`/nomina`): nada se exporta sin pasar por ahí, la exportación se audita
(`nomina.exportacion`, quién/periodo/formato) ANTES de generar el archivo, y
al exportar se materializa la tabla `incidencias` del periodo. Los bonos con
`requiere_aprobacion` no se aplican hasta que un administrador los aprueba
(queda en `bonos_aprobaciones` y en `auditoria`).

## Nota sobre el salario mínimo

`configuracion_nomina.salario_minimo_diario` guarda el mínimo general diario
vigente (CONASAMI); ajústalo cada enero. El motor lo recibe como parámetro:
no hay valores legales enterrados en el código de cálculo.
