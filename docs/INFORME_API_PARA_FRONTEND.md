# Informe de la API para el frontend (rama `fix/api-bd-monsterasp`)

Fecha: 18/11/2026. Cambios de contrato JSON de `backend/TransporteUnab.Api` que la web debe conocer.
Ningún campo existente cambió de nombre. Los cambios son campos nuevos, valores que antes eran falsos
(siempre 0) y respuestas de error más claras.

## 1. Errores: siempre JSON con `message`

Todas las respuestas de error tienen la forma:

```json
{ "message": "Texto listo para mostrar", "codigo": "V-03" }
```

- `codigo` es la validación que falló (`V-01` a `V-14`) o `null`.
- Los errores de formato (tipo de dato, JSON roto, falta el cuerpo) traen además `errors: { campo: [mensajes] }`.
- Códigos HTTP: `400` dato no válido, `404` no existe, `405` acción no permitida, `409` duplicado (placa, DNI,
  n.º de vale, trimestre ya cerrado), `503` sin conexión con la BD, `500` error interno (sin trazas).
- `api.js` ya lee `errBody.message`, así que no hace falta cambiar nada para mostrarlos.

## 2. Cambios por endpoint

| Endpoint | Cambio | Qué hacer en la web |
|---|---|---|
| `GET /combustible` | `km_consumidos` y `rendimiento` ahora se calculan (antes siempre `0`). Son `null` en el primer vale de cada unidad. Nuevo `rendimiento_sospechoso` (bool, V-09; `false` mientras no haya rangos). | Mostrar «—» cuando sean `null` (hoy `formatNumber` muestra `0`). |
| `GET /turnos` | Nuevos `id_ruta` (primera ruta) e `id_rutas` (todas). `ruta_texto` une todas las rutas con «, ». Orden: fecha y hora de salida descendentes. | El formulario de edición ya usa `existing.id_ruta`: ahora sí preselecciona la ruta. |
| `POST/PUT /turnos` | `POST`: `id_ruta` 0/`null` = sin ruta. `PUT`: `id_ruta` 0/`null` = **no cambiar** la ruta; `id_ruta > 0` la reemplaza; `id_rutas: []` la quita. Opcional `id_rutas: [..]` para varias rutas. | Nada obligatorio. |
| `DELETE /turnos/{id}` | Devuelve `405`: no hay anulación de turnos (decisión 12). | `api.deleteTurno` no debe usarse (hoy no hay botón). |
| `GET /unidades` | Nuevo `numero_bus` (últimos 3 dígitos de la placa, `null` si no hay 3). `km_actual` = mayor km entre bitácora y vales (antes solo bitácora). `?incluir_inactivas=true` para ver las dadas de baja. | Puede mostrar `numero_bus`. |
| `DELETE /unidades/{id}` | **Nuevo.** Baja lógica (`activo=0`; si estaba «Operativo» pasa a «Inactivo», V-14). | Botón «Dar de baja». |
| `PUT /unidades/{id}/reactivar` | **Nuevo.** Vuelve a `activo=1`. | Opcional. |
| `GET /unidades/{id}/historial` | Nuevo `numero_bus`. `abastecimientos[]` trae `km_consumidos` y `rendimiento`. `incidentes[]` trae `id_conductor` y `conductor` (el del turno cuyo horario cubre la hora del incidente, decisión 13; `null` si ninguno). | Mostrar el conductor del incidente. |
| `GET /conductores` | Nuevo `numero_bus`. `?solo_activos=true` filtra. | — |
| `DELETE /conductores/{id}` | **Nuevo.** Baja lógica (`activo=0`). | Botón «Dar de baja». |
| `PUT /conductores/{id}/reactivar` | **Nuevo.** | Opcional. |
| `GET /conciliacion` | `galones_sistema` ahora es la suma de vales **del mismo trimestre** (antes era el total histórico, igual en todas las filas). Nuevo `diferencia` = grifo − sistema. | Puede usar `diferencia`. |
| `POST /conciliacion` | Devuelve el registro guardado (antes devolvía el cuerpo enviado, con `id_reporte: 0` al actualizar). | — |
| `GET /reportes/trimestral` | Cada unidad trae también `tipo`. El cierre incluye **todas** las unidades activas (y las de baja con movimientos en el trimestre), no solo buses. `rendimiento` puede ser `null` (sin vale anterior al trimestre). | Mostrar «—» si `rendimiento` es `null`. |
| `POST /reportes/cerrar-trimestre` | Calcula solo con datos del trimestre (antes sumaba todo el historial). `409` si ya está cerrado. | — |
| `POST /reportes/actualizar-cierre` | **Nuevo** (botón «Actualizar cierre», V-12/S-05). Cuerpo `{ anio, trimestre }`. | Agregar el botón en Reportes. |
| `POST/PUT /combustible` y `/turnos` | Si el registro cae en un trimestre cerrado, la API recalcula ese cierre y los siguientes y lo indica en la cabecera `X-Cierres-Recalculados` (p. ej. `T2-2026,T3-2026`). | Leer la cabecera y avisar al usuario (V-12 pide aviso). |
| `POST /estimacion` | `costo_estimado` lo calcula el servidor (se ignora el enviado). `distancia_km` se toma como distancia total (ida y vuelta), igual que la web. `400` si rendimiento o precio ≤ 0. | — |
| Respuestas de `POST/PUT` que devuelven la entidad | Ya no incluyen las claves de navegación vacías (`unidad`, `conductor`, `area`, `rol`: siempre eran `null`). | Ninguno: la web no las usa. |

## 3. Reglas que ahora aplica la API (pueden aparecer como mensajes nuevos)

- **V-01** km final > km inicial · **V-05** hora de llegada > hora de salida.
- **V-03** el km de un turno o vale no puede ser menor que el último de la unidad (ni mayor que uno posterior).
- **V-04** galones > 0 · **V-06** fechas no futuras (hora de Perú) en turnos, vales, mantenimientos e incidentes.
- **V-07** placa, DNI y n.º de vale únicos (también al editar) → `409`.
- **V-08** DNI de 8 dígitos · **V-14** unidad de baja no puede quedar «Operativo».
- **V-10** no se registran turnos ni vales con unidad o conductor de baja.
- **V-13** en un bus, el conductor debe estar asignado a ese bus; en otras unidades, un conductor sin bus (S-07).
  Al **editar** un turno o vale, V-10 y V-13 solo se revisan si cambia la unidad o el conductor.
- **Solo buses** (decisión 1/S-01): bitácora, mantenimiento, documentos, incidentes y estimador.
  Se considera bus toda unidad cuyo `tipo` empiece con «Bus».
- Mantenimiento: `tipo` debe ser Preventivo, Correctivo o Predictivo.
- **V-02** y **V-09** quedan desactivadas hasta definir tolerancia y rangos
  (`Validaciones` en `appsettings.json`).

## 4. Problemas vistos en la web (no se tocó `frontend/`)

1. `api.js` cae a «modo local» si la respuesta es `null`; con `204` (logout) también vuelve al almacenamiento local.
2. Si la API devuelve un error, la web no lo muestra en algunos formularios (p. ej. `estimacion.js` no usa `try/catch`).
3. `formatNumber(null)` muestra `0`: confunde «sin dato» con «cero» en rendimiento y km consumidos.
4. El dashboard y Reportes calculan el rendimiento como km de bitácora ÷ galones de todo el historial; la fórmula
   acordada es km consumidos por vales ÷ galones del periodo (la API ya la aplica en cierres y en `/combustible`).
5. `mantenimiento.js` compara `m.tipo === 'Preventivo'`: la API guarda siempre la forma con mayúscula inicial.
6. Las opciones de `estado` («Operativo», «En mantenimiento», «Inactivo») y `tipo` («Bus», «Camioneta», «Minivan»)
   están fijas en la web y aún no las ha definido el cliente (decisión abierta).

## 5. Revisión del PR #2 (`fix/frontend-api-publicada`) contra esta API

Las 25 funciones de `js/api.js` (29 combinaciones de verbo y ruta) existen con el verbo y la ruta correctos, y los nombres de campo coinciden.
Fechas (`yyyy-MM-dd`, `datetime-local`), horas (`HH:mm`) y números se envían en el formato que la API acepta.
Lo que no coincide:

| # | Dónde | Problema | Quién lo corrige |
|---|---|---|---|
| 1 | `turnos.js`: selector de ruta `disabled` al editar | `FormData` no envía los campos deshabilitados → llega `id_ruta: 0` y el `PUT` borraba la ruta del turno. | **API (corregido):** en `PUT`, `id_ruta` 0 = no cambiar. |
| 2 | `validaciones.js` `validarRegistro` | Exige `conductor.id_unidad === id_unidad` para **todas** las unidades. Para unidades que no son bus la regla es la contraria (S-07: conductor sin bus asignado), así que la web impide registrar vales de camionetas y minivans. | **Web:** si la unidad no es bus, exigir `conductor.id_unidad == null`. |
| 3 | `validaciones.js` | Revisa V-10/V-13 también al editar registros antiguos sin cambiar unidad ni conductor; la API no (para poder corregir el historial tras reasignar conductores). | **Web:** revisar solo si cambió `id_unidad` o `id_conductor`, o en altas. |
| 4 | `validaciones.js` (km) | Compara con turnos y vales del **mismo día** sin mirar la hora: bloquea registrar un turno de la mañana si ya existe el de la tarde. La API compara turnos del mismo día por `hora_salida` e ignora vales del mismo día. | **Web:** comparar solo fechas anteriores, o dejar que la API valide (V-03 devuelve el mensaje). |
| 5 | `conductores.js` selector «Unidad asignada» | Ofrece todas las unidades; la API rechaza asignar conductores a unidades que no son bus (decisión 2). | **Web:** listar solo `tipo` que empiece con «Bus». |
| 6 | Selectores de unidad en `turnos.js`, `mantenimiento.js`, `estimacion.js` y botones «+ Documento»/«+ Nuevo incidente» del historial | Ofrecen camionetas y minivans; la API responde 400 (solo buses, decisión 1/S-01). | **Web:** filtrar buses u ocultar los botones si la unidad no es bus. |
| 7 | `estimacion.js` «Ruta sugerida» | Copia `km_referencia` (un tramo) en `distancia_km`, pero el costo usa distancia **ida y vuelta**: el presupuesto sale a la mitad. | **Web:** usar `km_referencia × 2` o rotular el campo como «solo ida» y duplicar. |
| 8 | `api.js` `getAbastecimientos` | Recalcula `km_consumidos`/`rendimiento` y pisa los valores de la API (ordena solo por km, sin redondeo). Da lo mismo en datos válidos, pero duplica la regla. | **Web:** usar los valores de la API y borrar el recálculo. |
| 9 | `api.js` `getConciliacion` | Pide `/combustible` para recalcular `galones_sistema`; la API ya lo da por trimestre y trae `diferencia`. | **Web:** usar `galones_sistema` y `diferencia` de la API (una petición menos). |
| 10 | `utils.js` `rendimientoPeriodo` | Si el primer vale del periodo no tiene vale anterior, suma sus galones pero cuenta sus km como 0: el rendimiento sale bajo. La fórmula acordada da `null` en ese caso. | **Web:** devolver `null` si algún vale del periodo tiene `km_consumidos == null`. |
| 11 | `validaciones.js` `confirmarPeriodo` y botón «Actualizar» de Reportes | El aviso dice que el cierre «requiere actualización», pero la API ya lo recalcula sola (cabecera `X-Cierres-Recalculados`). No hay botón que llame a `POST /reportes/actualizar-cierre`. | **Web:** cambiar el texto («se recalculará el cierre») y conectar «Actualizar cierre». |
| 12 | `unidades.js` número de bus | Usa `/\d{3}$/`: para `4521-EA` no muestra nada; la API da `numero_bus = "521"`. | **Web:** usar `u.numero_bus`. |
| 13 | `config.js` `REQUEST_TIMEOUT_MS: 6000` | MonsterASP tarda más de 6 s en el primer arranque; la web dirá «No se pudo conectar». | **Web:** subir a 15–20 s. |
| 14 | `api.js` `request` | Muestra un toast con cada error **y** lo lanza; varios formularios también lo pintan: el mensaje sale dos veces. | **Web** (cosmético). |

Sin cambios necesarios: login/logout (`id_sesion`, `nombre_completo`, `rol`), health (`database: "connected"`),
`PUT /unidades` con `id_usuario` de la sesión, `capacidad: 0` (la API la guarda como `null`), tipos de documento
(«Tarjeta de Propiedad» cabe en VARCHAR(20)) y el respaldo de `mantenimiento.js` (ya no hace falta: `GET /mantenimiento` dejó de dar 500).

## 6. Pendientes de seguridad (fuera de alcance, solo anotados)

- Contraseñas en texto plano y comparación sensible a la collation `CI` (no distingue mayúsculas).
- Sin JWT/autorización: todos los endpoints son públicos.
- CORS `AllowAnyOrigin`. Sin rate limiting en `/auth/login`.
- NU1902/NU1903: `System.Security.Cryptography.Pkcs` 9.0.4 vulnerable (dependencia transitiva).
- En `deploy-api.yml` las credenciales FTP se interpolan directamente en los comandos `curl`.
