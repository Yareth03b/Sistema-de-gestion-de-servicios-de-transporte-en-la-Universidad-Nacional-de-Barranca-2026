# Informe de la API para el frontend

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

## 7. Taller: ingreso y salida del mantenimiento (rama `feat/taller-reportes`, 21/11/2026)

`Mantenimiento.fecha` es la fecha de **ingreso** al taller; `fecha_salida` (nueva, `DATE NULL`) es la **salida**.
`fecha_salida = null` significa que el bus sigue en taller. La BD tiene `CK_Mantenimiento_Salida` (salida ≥ ingreso).

### 7.1 Campos nuevos en las respuestas de `/api/mantenimiento`

Todas las respuestas de `/api/mantenimiento` (GET, GET por id, POST y las de salida) tienen esta forma.
Las fechas van como `yyyy-MM-dd` (el POST antes devolvía la entidad con `fecha` en formato `2026-11-18T00:00:00`).

```json
{
  "id_mantenimiento": 7, "id_unidad": 2, "placa": "ABC-001",
  "fecha": "2026-11-18", "km": 12500, "tipo": "Preventivo",
  "detalle": "Cambio de aceite", "foto": "https://enlace-a-la-foto",
  "fecha_salida": null,
  "abierto": true,
  "en_taller_hoy": true,
  "dias_en_taller": 3
}
```

- `abierto`: `fecha_salida` es `null`.
- `en_taller_hoy`: `fecha <= hoy` y (`fecha_salida` es `null` o `fecha_salida > hoy`), con hoy en hora de Lima.
- `dias_en_taller`: `fecha_salida − fecha` o, si sigue abierto, `hoy − fecha`. Si entra y sale el mismo día, da `0`.
- `foto`: decisión D3. Es un enlace de texto (máx. 260 caracteres) en el campo que ya existía. La API no sube archivos.

### 7.2 Endpoints

| Verbo y ruta | Cuerpo | Qué hace | Errores |
|---|---|---|---|
| `GET /api/mantenimiento` | — | Lista, del más reciente al más antiguo | — |
| `GET /api/mantenimiento/{id}` | — | Un mantenimiento | 404 si no existe |
| `POST /api/mantenimiento` | `{ id_unidad, fecha, km, tipo, detalle?, foto?, fecha_salida? }` | Registra el ingreso. Sin `fecha_salida`, queda abierto (en taller). Con `fecha_salida`, se registra ya cerrado (historial antiguo) | 400 si no es bus, el tipo no es válido, el km es negativo o la salida es anterior al ingreso · 400 `V-06` si el ingreso o la salida son futuros · **409 si el bus ya tiene un mantenimiento abierto** |
| `POST /api/mantenimiento/{id}/salida` | opcional: `{ "fecha_salida": "2026-11-21" }` | Registra la salida. Sin cuerpo o sin fecha, usa **hoy (Lima)** | 404 si no existe · 409 si ya tiene salida (para corregirla, usar PUT) · 400 si la salida es anterior al ingreso · 400 `V-06` si la salida es futura |
| `PUT /api/mantenimiento/{id}/salida` | `{ "fecha_salida": "2026-11-20" }` (obligatorio) | Corrige la fecha de salida. También sirve para fijarla si el mantenimiento está abierto | 404 · 400 si falta `fecha_salida` · 400 si la salida es anterior al ingreso · 400 `V-06` si es futura |
| `DELETE /api/mantenimiento/{id}/salida` | — | **Deshace** una salida registrada por error: `fecha_salida` vuelve a `null` y el bus queda otra vez en taller | 404 · 409 si no tenía salida · 409 si el bus ya tiene otro mantenimiento abierto · 409 si hay un ingreso posterior de ese bus (en ese caso, corregir con PUT) |

Ejemplos de error:

```json
{ "message": "El bus ABC-001 ya está en taller desde el 18/11/2026 (mantenimiento 2). Registre su salida antes de un nuevo ingreso.", "codigo": null }
{ "message": "La fecha de salida (17/11/2026) no puede ser anterior a la de ingreso (18/11/2026).", "codigo": null }
{ "message": "La fecha de salida (25/11/2026) no puede ser futura.", "codigo": "V-06" }
{ "message": "El mantenimiento 2 ya tiene salida registrada el 21/11/2026. Para corregirla use PUT /api/mantenimiento/2/salida.", "codigo": null }
```

**Regla:** cada bus puede tener **un solo mantenimiento abierto**. Si hay que registrar varios trabajos en un
mismo ingreso, se describen en `detalle` o se registran cerrados (con `fecha_salida`).

### 7.3 Estado de la unidad derivado (`GET /api/unidades`)

Un bus está **«En mantenimiento»** si tiene un mantenimiento con `fecha <= hoy` y (`fecha_salida` es `null`
o `fecha_salida > hoy`). Si no, se muestra el estado guardado. El día de la salida ya cuenta como operativo
desde las 00:00 (hora de Lima). Se calcula en cada consulta: no hay procesos en segundo plano.
Las unidades dadas de baja (`activo = false`) muestran siempre su estado guardado.

Campos de cada unidad (los nuevos se explican debajo):

```json
{
  "id_unidad": 2, "placa": "ABC-001", "tipo": "Bus", "...": "...",
  "estado": "En mantenimiento",
  "estado_guardado": "Operativo",
  "en_taller": true,
  "id_mantenimiento_taller": 2,
  "taller_desde": "2026-11-18",
  "dias_en_taller": 3,
  "activo": true, "numero_bus": "001", "km_actual": 1180
}
```

- `estado` **ahora es el estado derivado**. Es el que debe mostrarse, y con él `dashboard.js` («Buses operativos
  hoy», `u.estado === 'Operativo'`) ya cuenta bien sin cambios.
- `estado_guardado` *(nuevo)* es el valor de la columna. **El formulario de edición debe precargar
  `estado_guardado`, no `estado`.** Por seguridad, si un PUT envía «En mantenimiento» mientras el bus está en
  taller, la API conserva el estado guardado.
- `en_taller`, `id_mantenimiento_taller`, `taller_desde` y `dias_en_taller` son nuevos. Valen `false` o `null`
  si el bus no está en taller.
- Al registrar o corregir una salida, si la unidad tenía guardado «En mantenimiento» (puesto a mano) y ya no queda
  ningún mantenimiento abierto, el estado guardado pasa a «Operativo». Si no, el bus seguiría mostrándose en
  mantenimiento para siempre.
- Recomendación para la web: quitar «En mantenimiento» de las opciones del selector de estado de la unidad.
  Ahora ese estado se obtiene registrando el ingreso al taller.

`GET /api/unidades/{id}/historial` agrega `estado_actual` y `en_taller`. Cada elemento de `mantenimientos`
trae además `fecha_salida` y `dias_en_taller`. Las fechas mantienen el formato que ya tenía ese endpoint.

### 7.4 `GET /api/dashboard/buses-operativos` (nuevo)

```json
{
  "fecha": "2026-11-21",
  "total_buses": 3,
  "operativos": 1,
  "en_taller": 1,
  "buses": [
    { "id_unidad": 2, "placa": "ABC-001", "numero_bus": "001", "estado": "En mantenimiento", "en_taller": true },
    { "id_unidad": 4, "placa": "ABC-003", "numero_bus": "003", "estado": "En mantenimiento", "en_taller": false },
    { "id_unidad": 1, "placa": "ABC-005", "numero_bus": "005", "estado": "Operativo", "en_taller": false }
  ]
}
```

Solo cuenta buses activos. `operativos` = buses cuyo estado derivado es «Operativo». Un bus puede estar
«En mantenimiento» con `en_taller: false` si así lo tiene guardado a mano (el caso de ABC-003 en la BD actual).

### 7.5 Aviso al registrar un turno de un bus en taller

`POST /api/turnos` y `PUT /api/turnos/{id}` **no bloquean** si el bus figura en taller en la fecha del turno.
La respuesta trae los mismos campos que antes más `aviso` (texto, o `null` si no hay nada que avisar):

```json
{
  "id_turno": 12, "id_unidad": 2, "id_conductor": 2, "fecha": "2026-11-20T00:00:00",
  "hora_salida": "07:00:00", "hora_llegada": "09:00:00", "km_inicial": 1000, "km_final": 1050,
  "km_recorridos": 50, "observaciones": null,
  "aviso": "El bus ABC-001 figura en taller el 20/11/2026 (ingresó el 18/11/2026, mantenimiento 2). El turno se guardó; si el bus ya salió, registre la salida del mantenimiento."
}
```

**Web:** si `aviso` no es `null`, mostrarlo (por ejemplo, como toast de advertencia) además del mensaje de guardado.

### 7.6 Datos actuales en la BD

Hay dos mantenimientos de ABC-001 del 18/11/2026, idénticos y sin salida (ids 1 y 2; probablemente un doble envío).
No se cambió ningún dato. Con esta versión, ABC-001 figura en taller hasta que se registre la salida de **ambos**.
La regla de «uno abierto por bus» solo se aplica a los ingresos nuevos.

## 8. Reportes por unidad, detalle de conciliación y edición de documentos (rama `feat/reportes-conciliacion`)

### 8.1 `GET /api/reportes/por-unidad` (nuevo, panel 09)

Parámetros (todos opcionales):

| Parámetro | Valor | Por defecto |
|---|---|---|
| `mes` | `yyyy-MM` (p. ej. `2026-11`) | mes actual, si no se envía `desde` y `hasta` |
| `desde`, `hasta` | `yyyy-MM-dd`; los dos inclusive y obligatorios juntos | — |
| `id_unidad` | id de la unidad | todas |
| `dias` | `calendario` o `habiles` | `calendario` |

```json
{
  "periodo": { "desde": "2026-11-01", "hasta": "2026-11-30", "dias": "calendario", "dias_contados": 21, "dias_hasta": "2026-11-21" },
  "totales": { "km_periodo": 650, "galones": 75.00, "vales": 3, "rendimiento_flota": 13.33, "promedio_diario": 30.95 },
  "unidades": [
    { "id_unidad": 1, "placa": "EGT-801", "numero_bus": "801", "tipo": "Bus", "activo": true,
      "km_periodo": 600, "km_fuente": "vales", "galones": 45.00, "galones_rendimiento": 45.00, "vales": 2,
      "rendimiento": 13.33, "km_acumulado": 10600, "promedio_diario": 28.57 }
  ]
}
```

Cómo se calcula cada campo (igual que el cierre trimestral y el dashboard, para que den las mismas cifras;
la regla se corrigió el 22/11/2026, ver la sección 10):

- `km_periodo`: la suma de los `km_consumidos` (los de `GET /combustible`) de los vales del periodo que tienen vale
  anterior (`km_fuente: "vales"`). Si la unidad tiene un vale antes del inicio, equivale a `km_actual` del último vale
  del periodo − `km_actual` del último vale anterior al inicio. Si ningún vale del periodo tiene referencia, se usan
  los km de la bitácora del periodo (`km_fuente: "bitacora"`). Si tampoco hay bitácora, `0` (`km_fuente: null`).
- `galones`: la suma de **todos** los vales del periodo (lo cargado).
- `galones_rendimiento` *(nuevo)*: los galones de los vales que tienen vale anterior. Solo es menor que `galones`
  cuando el primer vale de la unidad cae en el periodo: ese vale no tiene km de referencia.
- `rendimiento`: `km_periodo ÷ galones_rendimiento`, solo cuando `km_fuente` es `"vales"`. **Nunca es un promedio
  de rendimientos.** Es `null` si ningún vale tiene referencia o si los galones son 0 (no se divide entre cero).
- `rendimiento_flota`: Σ km ÷ Σ `galones_rendimiento` de las unidades que tienen `rendimiento` (las demás se omiten).
  Es exactamente `rendimientoFlota()` del dashboard.
- `km_acumulado`: el mayor km registrado (vales o bitácora) hasta el fin del periodo.
- `promedio_diario`: `km_periodo ÷ dias_contados`, redondeado a 2 decimales. Es `null` si `dias_contados` es 0.

**Cómo se cuentan los días.** Se cuenta desde `desde` hasta `hasta` o hasta hoy, lo que ocurra primero
(`dias_hasta`): en el mes en curso no se cuentan los días que aún no pasaron.

- `calendario` *(por defecto)*: todos los días. Se eligió porque los buses también salen fines de semana, no hay
  tabla de feriados y así se mantiene la misma base que la estimación de «días al próximo mantenimiento».
- `habiles`: de lunes a viernes. **No descuenta feriados**, porque la BD no los registra.

Errores: 400 si `mes` no tiene el formato correcto, si se envía `mes` junto con `desde`/`hasta`, si falta
`desde` o `hasta`, si `hasta` es anterior a `desde`, si el periodo supera los 2 años o si `dias` no es válido.
400 `V-06` si el periodo empieza en el futuro. 404 si `id_unidad` no existe.

Incluye las unidades activas y las dadas de baja que tuvieron vales o turnos en el periodo.
**Web (`reportes.js`):** usar este endpoint en lugar de sumar todo el histórico en el navegador.

### 8.2 `GET /api/conciliacion/detalle?anio=2026&trimestre=4` (nuevo, panel 12)

La conciliación sigue siendo **trimestral** (decisión D1). Devuelve el detalle por unidad según los vales, haya o no
reporte del grifo guardado:

```json
{
  "anio": 2026, "trimestre": 4, "desde": "2026-10-01", "hasta": "2026-12-31",
  "reporte": { "id_reporte": 1, "galones_total": 100.00, "observaciones": null },
  "galones_sistema": 85.00,
  "cantidad_vales": 4,
  "diferencia": 15.00,
  "unidades": [
    { "id_unidad": 1, "placa": "EGT-801", "numero_bus": "801", "cantidad_vales": 3,
      "nros_vale": ["001-001", "001-002", "001-003"], "galones": 55.00,
      "vales": [ { "nro_vale": "001-001", "fecha": "2026-10-27", "galones": 10.00 } ] }
  ]
}
```

- `reporte` y `diferencia` son `null` si aún no se guardó el total del grifo de ese trimestre.
- `diferencia` = `galones_total` del grifo − `galones_sistema`, con el mismo signo que `GET /api/conciliacion`.
- Errores: 400 si `trimestre` no está entre 1 y 4 o si el año no es válido.
- Para guardar el total del grifo se sigue usando `POST /api/conciliacion` (sin cambios).

### 8.3 `PUT /api/unidades/documentos/{id}` (nuevo, panel 15)

Edita un documento de la unidad (SOAT, revisión técnica…). El cuerpo es el mismo que el del POST:

```json
{ "id_unidad": 2, "tipo": "SOAT", "numero": "POL-2026-0457", "fecha_vencimiento": "2027-03-15" }
```

- El documento **no cambia de unidad**: se ignora `id_unidad`.
- Validaciones (las mismas que el POST): la unidad debe ser bus · `tipo` es obligatorio (máx. 20 caracteres) ·
  `numero` es obligatorio (máx. 30 caracteres) · `fecha_vencimiento` debe estar entre los años 2000 y 2100.
- Errores: 400 con el campo que falla · 404 si el documento no existe.
- Respuesta: el documento actualizado `{ id_documento, id_unidad, tipo, numero, fecha_vencimiento }`.

En `GET /api/unidades/{id}/historial`, cada documento trae además `dias_para_vencer` (negativo si ya venció)
y `vencido` (bool), para mostrar «Vence en 12 días».

### 8.4 Decisiones aplicadas

- **D2, «Motivo» del vale:** se escribe dentro de `observaciones` (máx. 300 caracteres). No hay campo nuevo.
- **D3, foto del mantenimiento:** es un enlace de texto en el campo `foto`, que ya existía (máx. 260 caracteres).
- No se cambió el esquema de la BD. Los campos existentes conservan su nombre y su formato, salvo lo indicado en 7.1.

## 9. Próximos mantenimientos con días estimados (rama `feat/proximos-mantenimientos`, HU-09)

### 9.1 `GET /api/mantenimiento/proximos` (nuevo, panel 17)

Devuelve una fila por **bus activo**. Las camionetas, las minivans y las unidades dadas de baja no aparecen.
Los buses que están en taller **sí aparecen**, marcados con `en_taller: true`; su estado no cambia.

| Parámetro | Valor | Por defecto |
|---|---|---|
| `dias` | `calendario` o `habiles` (lunes a viernes, sin feriados). Es el mismo criterio que `/api/reportes/por-unidad` | `calendario` |
| `ventana_dias` | Días hacia atrás, contando hoy, con los que se calcula el promedio diario: de 7 a 365 | `30` |

```json
{
  "intervalo_km": 5000,
  "umbral_proximo_km": 500,
  "promedio": { "desde": "2026-10-24", "hasta": "2026-11-22", "dias": "calendario", "dias_contados": 30 },
  "buses": [
    { "id_unidad": 2, "placa": "EGT-802", "numero_bus": "802", "en_taller": false,
      "id_ultimo_preventivo": 9, "fecha_ultimo_preventivo": "2026-08-14", "km_ultimo_preventivo": 1000,
      "km_actual": 6300, "km_desde_preventivo": 5300, "km_faltantes": -300, "porcentaje_avance": 106.0,
      "promedio_diario": 43.33, "dias_estimados": -6, "estado": "vencido", "observacion": null },
    { "id_unidad": 1, "placa": "EGT-801", "numero_bus": "801", "en_taller": false,
      "id_ultimo_preventivo": 4, "fecha_ultimo_preventivo": "2026-10-13", "km_ultimo_preventivo": 10000,
      "km_actual": 12400, "km_desde_preventivo": 2400, "km_faltantes": 2600, "porcentaje_avance": 48.0,
      "promedio_diario": 30.00, "dias_estimados": 87, "estado": "al_dia", "observacion": null },
    { "id_unidad": 3, "placa": "EGT-803", "numero_bus": "803", "en_taller": false,
      "id_ultimo_preventivo": null, "fecha_ultimo_preventivo": null, "km_ultimo_preventivo": null,
      "km_actual": 3200, "km_desde_preventivo": null, "km_faltantes": null, "porcentaje_avance": null,
      "promedio_diario": 40.00, "dias_estimados": null, "estado": null,
      "observacion": "Sin mantenimiento preventivo registrado." }
  ]
}
```

### 9.2 Cómo se calcula cada campo

- **Último preventivo:** solo el tipo `Preventivo` reinicia el conteo (S-02). Los correctivos y predictivos no cuentan.
  Se toma el de fecha más reciente; si hay varios en la misma fecha, el de mayor km.
- `km_actual`: el mismo que `GET /api/unidades`, es decir, el mayor km registrado entre la bitácora y los vales.
- `km_desde_preventivo` = `km_actual − km_ultimo_preventivo`.
- `km_faltantes` = `5000 − km_desde_preventivo`. **Es negativo si el bus ya se pasó.**
- `porcentaje_avance` = `km_desde_preventivo ÷ 5000 × 100`, con 1 decimal. No tiene tope: puede superar 100.
  La barra de la web debe limitarlo a 100.
- `promedio_diario`: los km de la ventana ÷ `promedio.dias_contados`. Los km se calculan con la misma fórmula que
  `km_periodo` de `/api/reportes/por-unidad`, así que coincide con
  `/api/reportes/por-unidad?desde={promedio.desde}&hasta={promedio.hasta}&dias=...`.
  Es **`null` si el bus no tiene km en la ventana**.
- `dias_estimados` = `km_faltantes ÷ promedio_diario`, redondeado hacia arriba a días enteros. Si es negativo, el
  preventivo venció hace unos N días. Con `dias=habiles` son días hábiles.
- `estado`: `vencido` si `km_faltantes < 0`, `proximo` si `km_faltantes ≤ 500` y `al_dia` en el resto de los casos.
  Son los mismos umbrales que los avisos del dashboard.
- **Orden:** primero lo más urgente (menos `km_faltantes`) y al final las filas sin cálculo.

**Valores `null`, nunca `0` ni error:**

| Caso | Campos en `null` | `observacion` |
|---|---|---|
| Sin mantenimiento preventivo | `km_ultimo_preventivo`, `km_desde_preventivo`, `km_faltantes`, `porcentaje_avance`, `dias_estimados`, `estado` | «Sin mantenimiento preventivo registrado.» |
| El km del preventivo es mayor que el `km_actual` (datos inconsistentes) | los mismos, salvo los del preventivo, que sí se muestran | «El km del último preventivo (…) es mayor que el km actual (…). Revise los registros.» |
| Sin km en la ventana | `promedio_diario` y `dias_estimados` | `null` (los km sí se calculan) |

`dias_estimados` nunca divide entre cero: si `promedio_diario` es `null` o `0`, devuelve `null`.

**Errores:** 400 si `dias` no es `calendario` ni `habiles`, o si `ventana_dias` no está entre 7 y 365.

**Web (`mantenimiento.js` y `dashboard.js`):** la tabla «Próximos mantenimientos» puede usar este endpoint en lugar de
calcular en el navegador. El dashboard hoy usa el preventivo de **mayor km**, no el más reciente, y fija en 0 los km
negativos.

### 9.3 Con los datos actuales de producción (22/11/2026)

- **ABC-001:** el preventivo es de 12 500 km, pero su `km_actual` es 1 180, así que aparece con `observacion` de
  datos inconsistentes. Hoy el dashboard muestra «Faltan 5 000 km», porque fija en 0 los km negativos.
- **ABC-003 y ABC-005:** no tienen preventivo, así que aparecen con «Sin mantenimiento preventivo registrado».

## 10. Corrección: el reporte, el cierre y el dashboard ahora dan las mismas cifras (22/11/2026)

**El problema.** `GET /api/reportes/por-unidad` y el cierre trimestral calculaban el rendimiento como
`(último vale del periodo − último vale ANTERIOR al inicio) ÷ galones del periodo`, y daban `null` si la unidad no
tenía un vale anterior al periodo. El dashboard (`rendimientoPeriodo` y `rendimientoFlota` de `utils.js`) suma los
`km_consumidos` de los vales que tienen vale anterior, sin importar si ese vale anterior cae dentro o fuera del
periodo. Las dos reglas solo coinciden cuando la unidad tiene un vale antes del periodo.

Con los datos de producción:

| | ABC-001 | ABC-003 | Flota |
|---|---|---|---|
| Dashboard (noviembre) | 12,0 | 275,4 | 214,6 |
| `por-unidad?mes=2026-11`, antes | `null` (500 km de bitácora) | 275,4 | 275,4 |
| `por-unidad` del T4, antes (= lo que guardaría el cierre) | `null` | `null` (0 km) | `null` |
| `por-unidad` y cierre, **ahora** (noviembre y T4) | **12** (180 km) | **275,4** (13 770 km) | **214,62** |

**La corrección.** La API usa ahora la regla del dashboard en `Calculos.ResumirPeriodo`, que comparten el reporte
por unidad, el cierre trimestral y `GET /api/mantenimiento/proximos`. Si la unidad tiene un vale antes del periodo,
el resultado es idéntico al anterior. Si no lo tiene, ya no se pierden los km y el rendimiento de los vales que sí
tienen referencia dentro del periodo. Detalle en 8.1, con el campo nuevo `galones_rendimiento`.

- No hay cierres guardados (`GET /api/reportes/trimestral` devuelve `[]`), así que no cambia ningún dato.
- El cierre de T4, calculado en memoria con los datos reales y sin guardar, coincide en cada unidad con
  `por-unidad?desde=2026-10-01&hasta=2026-12-31`.
- Diferencia de presentación: la API redondea a 2 decimales y el dashboard muestra 1 (214,62 frente a 214,6).
