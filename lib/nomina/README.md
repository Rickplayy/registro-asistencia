# lib/nomina

Fase 6 (ver hoja de ruta y sección 11 del documento maestro). Motor de cálculo
de incidencias y exportación (Excel/CSV/SQL). **Proyecta, no timbra ni paga.**

Reglas LFT no configurables que este módulo deberá imponer:

- Nunca calcular descuentos en pesos por retardos (Art. 110 LFT).
- Tope de descuento ≤ 30% del excedente sobre el salario mínimo; jamás dejar
  al trabajador por debajo del mínimo.
- Faltas: descontar día no laborado + proporcional del séptimo día (Art. 69).
- Horas extra: primeras 9/semana al doble, excedente al triple (Art. 66-68).
- Más de 3 faltas injustificadas en 30 días ⇒ solo alerta a RH, nunca acción
  automática.
