"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";

import {
  actualizarEmpleado,
  cambiarEstatusEmpleado,
  regenerarPin,
  type AccionEmpleadoResult,
} from "@/lib/empleados/actions";
import { revocarRostro } from "@/lib/biometria/enrolamiento";
import {
  registrarConsentimientoHuella,
  revocarHuella,
} from "@/lib/biometria/huella";
import { EnrolamientoFacial } from "@/components/biometria/enrolamiento-facial";
import { QR_PASO_SEGUNDOS } from "@/lib/auth/qr-constantes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EmpleadoPlano = {
  id: string;
  nombre: string;
  puesto: string | null;
  numero_empleado: string | null;
  sexo: string | null;
  estatus: string;
  fecha_ingreso: string | null;
  curp: string | null;
  rfc: string | null;
  fecha_nacimiento: string | null;
};

/** QR rotativo: la imagen se refresca sola cada paso TOTP. */
function QrRotativo({ empleadoId }: { empleadoId: string }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setVersion((v) => v + 1),
      QR_PASO_SEGUNDOS * 1000,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/empleados/${empleadoId}/qr?v=${version}`}
      alt="Código QR rotativo del empleado"
      width={220}
      height={220}
      className="rounded-lg border bg-white p-2"
    />
  );
}

export function FichaEmpleado({
  empleado,
  rostroEnroladoDesde,
  huellasActivas,
  consentimientoHuella,
}: {
  empleado: EmpleadoPlano;
  /** created_at de la credencial facial vigente, o null si no hay. */
  rostroEnroladoDesde: string | null;
  /** Passkeys WebAuthn vigentes del empleado. */
  huellasActivas: number;
  /** ¿Hay consentimiento biometrico_huella vigente? */
  consentimientoHuella: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    AccionEmpleadoResult,
    FormData
  >(actualizarEmpleado.bind(null, empleado.id), undefined);

  const [pinNuevo, setPinNuevo] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [enTransicion, startTransition] = useTransition();
  const [mostrarQr, setMostrarQr] = useState(false);
  const [mostrarEnrolamiento, setMostrarEnrolamiento] = useState(false);

  const esBaja = empleado.estatus === "baja";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand">
            {empleado.nombre}
          </h1>
          <p className="text-sm text-muted-foreground">
            {empleado.puesto ?? "Sin puesto"} ·{" "}
            <Badge
              variant="secondary"
              className={
                esBaja
                  ? "bg-destructive text-white"
                  : "bg-success text-success-foreground"
              }
            >
              {empleado.estatus}
            </Badge>
          </p>
        </div>
        <Button variant="outline" render={<Link href="/empleados" />}>
          ← Empleados
        </Button>
      </div>

      {(errorAccion || state?.error) && (
        <Alert variant="destructive">
          <AlertDescription>{errorAccion ?? state?.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && (
        <Alert>
          <AlertDescription>Cambios guardados.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Datos (editables) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Datos del empleado</CardTitle>
            <CardDescription>
              CURP, RFC y fecha de nacimiento se guardan cifrados; este acceso
              queda auditado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre completo *</Label>
                <Input
                  id="nombre"
                  name="nombre"
                  defaultValue={empleado.nombre}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="puesto">Puesto</Label>
                  <Input
                    id="puesto"
                    name="puesto"
                    defaultValue={empleado.puesto ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero_empleado">No. empleado</Label>
                  <Input
                    id="numero_empleado"
                    name="numero_empleado"
                    defaultValue={empleado.numero_empleado ?? ""}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="curp">CURP</Label>
                  <Input
                    id="curp"
                    name="curp"
                    maxLength={18}
                    className="uppercase"
                    defaultValue={empleado.curp ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rfc">RFC</Label>
                  <Input
                    id="rfc"
                    name="rfc"
                    maxLength={13}
                    className="uppercase"
                    defaultValue={empleado.rfc ?? ""}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fecha_nacimiento">Fecha de nacimiento</Label>
                  <Input
                    id="fecha_nacimiento"
                    name="fecha_nacimiento"
                    type="date"
                    defaultValue={empleado.fecha_nacimiento ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fecha_ingreso">Fecha de ingreso</Label>
                  <Input
                    id="fecha_ingreso"
                    name="fecha_ingreso"
                    type="date"
                    defaultValue={empleado.fecha_ingreso ?? ""}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sexo">Sexo</Label>
                <select
                  id="sexo"
                  name="sexo"
                  defaultValue={empleado.sexo ?? ""}
                  className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="">Sin especificar</option>
                  <option value="M">Mujer</option>
                  <option value="H">Hombre</option>
                </select>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Métodos de acceso */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>PIN de acceso</CardTitle>
              <CardDescription>
                Solo se guarda su hash. Al regenerar, el anterior deja de
                funcionar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pinNuevo && (
                <Alert>
                  <AlertTitle>Nuevo PIN: {pinNuevo}</AlertTitle>
                  <AlertDescription>
                    Compártelo por un medio seguro; no se volverá a mostrar.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                variant="outline"
                disabled={enTransicion || esBaja}
                onClick={() =>
                  startTransition(async () => {
                    setErrorAccion(null);
                    const res = await regenerarPin(empleado.id);
                    if (res.ok) setPinNuevo(res.pin);
                    else setErrorAccion(res.error);
                  })
                }
              >
                {enTransicion ? "Generando…" : "Regenerar PIN"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Código QR rotativo</CardTitle>
              <CardDescription>
                Cambia cada {QR_PASO_SEGUNDOS} segundos: una foto del código no
                sirve después.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mostrarQr ? (
                <QrRotativo empleadoId={empleado.id} />
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setMostrarQr(true)}
                  disabled={esBaja}
                >
                  Mostrar QR vigente
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rostro (biometría facial)</CardTitle>
              <CardDescription>
                Solo se guarda la plantilla matemática cifrada, nunca una
                fotografía. Requiere consentimiento biométrico expreso; todo
                acceso queda auditado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rostroEnroladoDesde ? (
                <p className="text-sm">
                  <Badge className="bg-success text-success-foreground">
                    Enrolado
                  </Badge>{" "}
                  desde el{" "}
                  {new Date(rostroEnroladoDesde).toLocaleDateString("es-MX")}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin rostro enrolado.
                </p>
              )}
              {mostrarEnrolamiento ? (
                <EnrolamientoFacial
                  empleadoId={empleado.id}
                  onEnrolado={() => window.location.reload()}
                />
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={esBaja}
                    onClick={() => setMostrarEnrolamiento(true)}
                  >
                    {rostroEnroladoDesde
                      ? "Re-enrolar rostro"
                      : "Enrolar rostro"}
                  </Button>
                  {rostroEnroladoDesde && (
                    <Button
                      variant="destructive"
                      disabled={enTransicion}
                      onClick={() =>
                        startTransition(async () => {
                          setErrorAccion(null);
                          const res = await revocarRostro(empleado.id);
                          if (res.ok) window.location.reload();
                          else setErrorAccion(res.error);
                        })
                      }
                    >
                      Revocar
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Huella digital (WebAuthn)</CardTitle>
              <CardDescription>
                La huella se verifica en el sensor del kiosko y nunca sale de
                él; el sistema solo guarda una clave pública de verificación. El
                enrolamiento se hace en el kiosko con el PIN del empleado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                Consentimiento:{" "}
                {consentimientoHuella ? (
                  <Badge className="bg-success text-success-foreground">
                    registrado
                  </Badge>
                ) : (
                  <Badge variant="secondary">sin registrar</Badge>
                )}{" "}
                · Huellas enroladas: <strong>{huellasActivas}</strong>
              </p>
              <div className="flex flex-wrap gap-3">
                {!consentimientoHuella && (
                  <Button
                    variant="outline"
                    disabled={enTransicion || esBaja}
                    onClick={() =>
                      startTransition(async () => {
                        setErrorAccion(null);
                        const res = await registrarConsentimientoHuella(
                          empleado.id,
                        );
                        if (res.ok) window.location.reload();
                        else setErrorAccion(res.error);
                      })
                    }
                  >
                    Registrar consentimiento
                  </Button>
                )}
                {(consentimientoHuella || huellasActivas > 0) && (
                  <Button
                    variant="destructive"
                    disabled={enTransicion}
                    onClick={() =>
                      startTransition(async () => {
                        setErrorAccion(null);
                        const res = await revocarHuella(empleado.id);
                        if (res.ok) window.location.reload();
                        else setErrorAccion(res.error);
                      })
                    }
                  >
                    Revocar huella y consentimiento
                  </Button>
                )}
              </div>
              {consentimientoHuella && huellasActivas === 0 && (
                <p className="text-xs text-muted-foreground">
                  Listo para enrolar: el empleado debe ir al kiosko, elegir
                  Huella → &quot;Primera vez aquí&quot; y teclear su PIN.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {esBaja ? "Reactivar empleado" : "Dar de baja"}
              </CardTitle>
              <CardDescription>
                {esBaja
                  ? "Vuelve a permitir su check-in en el kiosko."
                  : "Conserva su historial; su PIN y QR dejan de funcionar en el kiosko."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant={esBaja ? "default" : "destructive"}
                disabled={enTransicion}
                onClick={() =>
                  startTransition(async () => {
                    setErrorAccion(null);
                    const res = await cambiarEstatusEmpleado(
                      empleado.id,
                      esBaja ? "activo" : "baja",
                    );
                    if (res?.error) setErrorAccion(res.error);
                    else window.location.reload();
                  })
                }
              >
                {esBaja ? "Reactivar" : "Dar de baja"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
