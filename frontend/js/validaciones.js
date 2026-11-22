import { esBus, formatHora, formatSpaceInt } from './utils.js?v=5';
import { api } from './api.js?v=5';

export function falloCampo(campo, message) {
  return Object.assign(new Error(message), { campo });
}

export function errorKilometraje(payload, existing, turnos, vales) {
  const inicio = payload.km_inicial ?? payload.km_actual;
  const fin = payload.km_final ?? payload.km_actual;
  let minimo = 0;
  let maximo = Infinity;
  const comparar = (fecha, hora, desde, hasta) => {
    const orden = fecha.slice(0, 10).localeCompare(payload.fecha) ||
      (hora && payload.hora_salida ? formatHora(hora).localeCompare(formatHora(payload.hora_salida)) : 0);
    if (orden < 0) minimo = Math.max(minimo, hasta);
    if (orden > 0) maximo = Math.min(maximo, desde);
  };
  for (const t of turnos) {
    if (t.id_unidad === payload.id_unidad && t.id_turno !== existing?.id_turno)
      comparar(t.fecha, t.hora_salida, t.km_inicial, t.km_final);
  }
  for (const v of vales) {
    if (v.id_unidad === payload.id_unidad && v.id_abastecimiento !== existing?.id_abastecimiento)
      comparar(v.fecha, null, v.km_actual, v.km_actual);
  }
  if (inicio < minimo) return falloCampo('km_actual' in payload ? 'km_actual' : 'km_inicial',
    `El valor es menor que ${formatSpaceInt(minimo)} km. Ingresa ${formatSpaceInt(minimo)} km o más.`);
  if (fin > maximo) return falloCampo('km_actual' in payload ? 'km_actual' : 'km_final',
    `Hay un registro posterior con ${formatSpaceInt(maximo)} km. Ingresa ese kilometraje o uno menor.`);
  return null;
}

export function validarRegistro(payload, existing, unidades, conductores, turnos, vales) {
  const error = errorKilometraje(payload, existing, turnos, vales);
  if (error) throw error;

  if (existing?.id_unidad === payload.id_unidad && existing.id_conductor === payload.id_conductor) return;
  const unidad = unidades.find(u => u.id_unidad === payload.id_unidad);
  const conductor = conductores.find(c => c.id_conductor === payload.id_conductor);
  if (!unidad?.activo) throw falloCampo('id_unidad', 'Selecciona una unidad activa.');
  if (!conductor?.activo) throw falloCampo('id_conductor', 'Selecciona un conductor activo.');
  if (esBus(unidad) ? conductor.id_unidad !== unidad.id_unidad : conductor.id_unidad != null) {
    throw falloCampo('id_conductor', esBus(unidad) ? 'El conductor debe estar asignado a este bus.' : 'Selecciona un conductor sin bus asignado.');
  }
}

// El controlador identifica las reglas con un código y explica la lectura afectada.
export function campoRegistro(err, turno = false) {
  const campos = {
    'V-01': err.message.includes('negativo') ? 'km_inicial' : 'km_final',
    'V-02': 'km_final', 'V-03': turno ? (err.message.includes('posterior') ? 'km_final' : 'km_inicial') : 'km_actual',
    'V-04': 'galones', 'V-05': 'hora_llegada', 'V-06': 'fecha', 'V-07': 'nro_vale',
    'V-10': err.message.includes('unidad') ? 'id_unidad' : 'id_conductor', 'V-13': 'id_conductor',
  };
  return campos[err.codigo];
}

export async function confirmarPeriodo(fecha, anterior) {
  const cierres = await api.getCierres();
  const cerrado = [fecha, anterior].some(f => f && cierres.some(cierre =>
    cierre.anio === Number(f.slice(0, 4)) && cierre.trimestre === Math.ceil(Number(f.slice(5, 7)) / 3)
  ));
  return !cerrado || window.confirm('El trimestre está cerrado. Verifica el recálculo del cierre después de guardar. ¿Continuar?');
}
