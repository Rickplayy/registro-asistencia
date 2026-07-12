# Política de retención y borrado de datos (derechos ARCO)

Fase 5 · Sección 2.2 del documento maestro (LFPDPPP). Esta política aplica a
los datos personales de empleados de las empresas cliente.

## Ciclo de vida

| Etapa | Qué pasa |
|---|---|
| **Alta** | Datos personales cifrados a nivel de columna (CURP, RFC, fecha de nacimiento); consentimiento registrado con versión de aviso, fecha e IP. |
| **Baja** | `estatus = baja` y se registra `fecha_baja`. El PIN/QR dejan de funcionar de inmediato; RH puede además revocar la biometría en la ficha (rostro y huella). Los datos se CONSERVAN durante el periodo de retención. |
| **Retención** | **365 días desde la fecha de baja** (mínimo legal del Art. 804 LFT para documentos laborales; constante `RETENCION_DIAS` en `lib/empleados/retencion.ts`). Durante este periodo la purga se rechaza indicando los días restantes. |
| **Purga** | Al cumplirse la retención, el administrador de la empresa puede ejecutar la purga desde la ficha del empleado. La acción queda en `auditoria` (`empleado.purga_arco`). |

## Qué elimina la purga

- Credenciales biométricas (plantillas faciales cifradas y passkeys WebAuthn).
- Métodos de acceso (hash de PIN, secreto QR).
- Datos personales del expediente: nombre (→ "Empleado purgado ####"), puesto,
  número de empleado, CURP, RFC, fecha de nacimiento y sexo.

## Qué se conserva y por qué

- **Registros de asistencia** (anonimizados): el registro electrónico de
  jornada es una obligación legal verificable (reforma 2027) e insumo de
  inspecciones STPS — se conserva sin datos personales asociados.
- **Consentimientos**: evidencia legal de que el tratamiento biométrico que
  existió fue consentido (defensa ante el INAI).
- **Bitácora de auditoría**: trazabilidad inmutable, incluida la propia purga.

## Derechos ARCO — cómo se atienden

- **Acceso/Rectificación**: la ficha del empleado permite a RH consultar y
  corregir los datos en cualquier momento.
- **Cancelación**: baja + purga tras la retención (este documento).
- **Oposición (biometría)**: revocación inmediata de credenciales faciales y
  de huella desde la ficha, sin esperar la baja (Fases 2-3).
