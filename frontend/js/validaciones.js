import { esBus } from './utils.js';
import { api } from './api.js';

export function validarRegistro(payload, existing, unidades, conductores, turnos, vales) {
  // Los vales no tienen hora. Solo los turnos se comparan entre sí dentro de una misma fecha.
  const inicio = payload.km_inicial ?? payload.km_actual;
  const fin = payload.km_final ?? payload.km_actual;
  const fueraDeOrden = (fecha, hora, desde, hasta) => {
    const orden = fecha.localeCompare(payload.fecha) ||
      (hora && payload.hora_salida ? hora.localeCompare(payload.hora_salida) : 0);
    return (orden < 0 && inicio < hasta) || (orden > 0 && fin > desde);
  };
  if (turnos.some(t => t.id_unidad === payload.id_unidad && t.id_turno !== existing?.id_turno &&
      fueraDeOrden(t.fecha, t.hora_salida, t.km_inicial, t.km_final)) ||
      vales.some(v => v.id_unidad === payload.id_unidad && v.id_abastecimiento !== existing?.id_abastecimiento &&
      fueraDeOrden(v.fecha, null, v.km_actual, v.km_actual))) {
    throw new Error('El kilometraje debe respetar los registros anteriores y posteriores de la unidad.');
  }

  if (existing?.id_unidad === payload.id_unidad && existing.id_conductor === payload.id_conductor) return;
  const unidad = unidades.find(u => u.id_unidad === payload.id_unidad);
  const conductor = conductores.find(c => c.id_conductor === payload.id_conductor);
  if (!unidad?.activo || !conductor?.activo) throw new Error('Selecciona una unidad y un conductor activos.');
  if (esBus(unidad) ? conductor.id_unidad !== unidad.id_unidad : conductor.id_unidad != null) {
    throw new Error(esBus(unidad) ? 'El conductor debe estar asignado a este bus.' : 'Selecciona un conductor sin bus asignado.');
  }
}

export async function confirmarPeriodo(fecha, anterior) {
  const cierres = await api.getCierres();
  const cerrado = [fecha, anterior].some(f => f && cierres.some(cierre =>
    cierre.anio === Number(f.slice(0, 4)) && cierre.trimestre === Math.ceil(Number(f.slice(5, 7)) / 3)
  ));
  return !cerrado || window.confirm('El trimestre está cerrado. Verifica el recálculo del cierre después de guardar. ¿Continuar?');
}
