import { api } from './api.js';

export function validarRegistro(payload, existing, unidades, conductores, turnos, abasts) {
  const conductor = conductores.find(c => c.id_conductor === payload.id_conductor);
  if (!unidades.some(u => u.id_unidad === payload.id_unidad && u.activo) ||
      !conductor?.activo || conductor.id_unidad !== payload.id_unidad) {
    throw new Error('Selecciona un conductor activo asignado a la unidad.');
  }
  const lecturas = [
    ...turnos.filter(t => t.id_unidad === payload.id_unidad && t.fecha <= payload.fecha && t.id_turno !== existing?.id_turno).map(t => t.km_final),
    ...abasts.filter(a => a.id_unidad === payload.id_unidad && a.fecha <= payload.fecha && a.id_abastecimiento !== existing?.id_abastecimiento).map(a => a.km_actual),
  ];
  if (lecturas.some(km => km > (payload.km_inicial ?? payload.km_actual))) {
    throw new Error('El kilometraje es menor al registrado para esa fecha.');
  }
}

export async function confirmarPeriodo(fecha, anterior) {
  const cierres = await api.getCierres();
  const cerrado = [fecha, anterior].some(f => f && cierres.some(cierre =>
    cierre.anio === Number(f.slice(0, 4)) && cierre.trimestre === Math.ceil(Number(f.slice(5, 7)) / 3)
  ));
  return !cerrado || window.confirm('El trimestre está cerrado. El cierre guardado requiere actualización. ¿Continuar?');
}
