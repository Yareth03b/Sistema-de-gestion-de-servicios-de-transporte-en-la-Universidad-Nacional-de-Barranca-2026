import { api } from '../api.js?v=11';
import { campoArea, altaArea, prepararArea } from './areas.js?v=11';
import { escapeHtml, formatDateES, formatHora, limitarTabla, mostrarErrorFormulario, openModal, showToast } from '../utils.js?v=11';

const coloresEstado = { Pendiente: 'urgent', Estimada: 'info', Aprobada: 'success', Rechazada: 'danger' };

export function fechaHora(fecha, hora) {
  return formatDateES(fecha) + ' ' + formatHora(hora);
}

export async function renderSolicitudes(container, estimar, estado = '') {
  const { areas } = await api.getRutasYCostos();
  if (!container.isConnected) return;
  container.innerHTML = `<section class="card">
    <div class="card-header"><h2 class="card-title">Solicitudes de viaje</h2>
      <button type="button" class="btn btn-primary" data-nueva>Nueva solicitud</button></div>
    <div class="filters-bar"><label>Estado <select class="select" name="estado">
      <option value="">Todos los estados</option>
      ${Object.keys(coloresEstado).map(estado => `<option>${estado}</option>`).join('')}
    </select></label></div>
    <div data-lista aria-live="polite"></div></section>`;
  const filtro = container.querySelector('[name=estado]');
  filtro.value = estado;
  const consultar = async () => {
    const lista = document.createElement('div');
    lista.dataset.lista = '';
    lista.setAttribute('aria-live', 'polite');
    lista.textContent = 'Cargando solicitudes…';
    container.querySelector('[data-lista]').replaceWith(lista);
    try {
      const solicitudes = await api.getSolicitudes({ estado: filtro.value });
      if (!lista.isConnected) return;
      lista.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Código</th><th>Área</th><th>Encargado</th><th>Salida</th><th>Regreso</th><th>Destino</th>
          <th>Pasajeros</th><th>Estado</th><th>Estimaciones</th><th>Acciones</th></tr></thead>
        <tbody>${solicitudes.map(s => `<tr data-id="${s.id_solicitud}">
          <td>${escapeHtml(s.codigo)}</td><td>${escapeHtml(s.area_nombre)}</td><td>${escapeHtml(s.encargado)}</td>
          <td>${fechaHora(s.fecha_salida, s.hora_salida)}</td><td>${fechaHora(s.fecha_regreso, s.hora_regreso)}</td>
          <td>${escapeHtml(s.lugar_destino)}</td><td>${s.pasajeros}</td>
          <td><span class="pill pill-${coloresEstado[s.estado]}">${escapeHtml(s.estado)}</span></td>
          <td>${s.cantidad_estimaciones}</td><td><div class="solicitud-acciones">
            <button type="button" class="btn-link" data-accion="editar">Editar</button>
            <button type="button" class="btn-link" data-accion="estimar">Estimar</button>
            ${['Aprobada', 'Rechazada'].filter(estado => estado !== s.estado).map(estado =>
              `<button type="button" class="btn-link" data-accion="${estado}">${estado === 'Aprobada' ? 'Aprobar' : 'Rechazar'}</button>`).join('')}
          </div></td></tr>`).join('') || '<tr><td colspan="10">No hay solicitudes para mostrar.</td></tr>'}</tbody>
        </table></div>`;
      limitarTabla(lista.querySelector('table'), solicitudes.length);
      lista.onclick = async e => {
        const boton = e.target.closest('[data-accion]');
        if (!boton) return;
        const accion = boton.dataset.accion;
        const id = Number(boton.closest('tr').dataset.id);
        boton.disabled = true;
        try {
          const s = await api.getSolicitud(id);
          if (!lista.isConnected) return;
          if (accion === 'editar') abrirFormulario(areas, consultar, s);
          else if (accion === 'estimar') estimar(s);
          else confirmarEstado(s, accion, consultar);
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          boton.disabled = false;
        }
      };
    } catch (err) {
      lista.textContent = err.message;
    }
  };
  filtro.onchange = consultar;
  container.querySelector('[data-nueva]').onclick = () => abrirFormulario(areas, consultar);
  await consultar();
}

function abrirFormulario(areas, actualizar, solicitud = {}) {
  const valor = nombre => escapeHtml(solicitud[nombre]);
  const campo = (nombre, etiqueta, tipo, atributos = '') => `<div class="field-group">
    <label class="field-label">${etiqueta}</label>
    <input class="input" name="${nombre}" type="${tipo}" value="${valor(nombre)}" ${atributos} required></div>`;
  openModal({
    title: solicitud.id_solicitud ? 'Editar solicitud' : 'Nueva solicitud',
    bodyHtml: `<form id="solicitud-form"><div class="form-grid-2">
      ${campo('codigo', 'Código del documento', 'text', 'maxlength="30"')}
      ${campoArea(true)}
      ${altaArea}
      ${campo('encargado', 'Encargado', 'text', 'maxlength="100"')}
      ${campo('pasajeros', 'Cantidad de pasajeros', 'number', 'min="1" step="1"')}
      ${campo('fecha_salida', 'Fecha de salida', 'date')}${campo('hora_salida', 'Hora de salida', 'time')}
      ${campo('fecha_regreso', 'Fecha de regreso', 'date')}${campo('hora_regreso', 'Hora de regreso', 'time')}
      ${campo('lugar_procedencia', 'Lugar de procedencia', 'text', 'maxlength="100"')}
      ${campo('lugar_destino', 'Lugar de destino', 'text', 'maxlength="100"')}
      <div class="field-group"><label class="field-label">Motivo</label>
        <textarea name="motivo" class="textarea" maxlength="300" required>${valor('motivo')}</textarea></div>
      <div class="field-group"><label class="field-label">Observaciones (opcional)</label>
        <textarea name="observaciones" class="textarea" maxlength="300">${valor('observaciones')}</textarea></div>
    </div><p class="field-error hidden" role="alert"></p>
    <div class="modal-actions"><button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>
      <button type="submit" class="btn btn-primary">Guardar solicitud</button></div></form>`,
    onMount(close) {
      const form = document.getElementById('solicitud-form');
      prepararArea(form, areas, solicitud.id_area, actualizar);
      form.onsubmit = async e => {
        e.preventDefault();
        const datos = Object.fromEntries(new FormData(form));
        for (const nombre of Object.keys(datos)) datos[nombre] = datos[nombre].trim();
        const vacio = Object.keys(datos).find(nombre => nombre !== 'observaciones' && !datos[nombre]);
        if (vacio) {
          mostrarErrorFormulario(form, new Error('Completa este campo.'), vacio);
          return;
        }
        if (datos.fecha_regreso + 'T' + datos.hora_regreso <= datos.fecha_salida + 'T' + datos.hora_salida) {
          mostrarErrorFormulario(form, new Error('El regreso debe ser posterior a la salida.'), 'hora_regreso');
          return;
        }
        datos.id_area = Number(datos.id_area);
        datos.pasajeros = Number(datos.pasajeros);
        datos.observaciones ||= null;
        const boton = form.querySelector('[type=submit]');
        if (boton.disabled) return;
        boton.disabled = true;
        try {
          await api.saveSolicitud(datos, solicitud.id_solicitud);
        } catch (err) {
          mostrarErrorFormulario(form, err, err.codigo === 'V-07' ? 'codigo' : undefined);
          boton.disabled = false;
          return;
        }
        if (form.isConnected) close();
        showToast('Solicitud guardada.', 'success');
        await actualizar();
      };
    },
  });
}

function confirmarEstado(s, estado, actualizar) {
  openModal({
    title: `¿Marcar la solicitud ${s.codigo} como ${estado}?`,
    bodyHtml: `<p>${escapeHtml(s.lugar_destino)} · ${fechaHora(s.fecha_salida, s.hora_salida)}</p>
      <div class="modal-actions"><button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>
        <button type="button" class="btn btn-primary" id="confirmar-estado">Confirmar</button></div>`,
    onMount(close) {
      const boton = document.getElementById('confirmar-estado');
      boton.onclick = async () => {
        boton.disabled = true;
        try {
          await api.cambiarEstadoSolicitud(s.id_solicitud, estado);
        } catch (err) {
          showToast(err.message, 'error');
          boton.disabled = false;
          return;
        }
        if (boton.isConnected) close();
        showToast(`Solicitud marcada como ${estado}.`, 'success');
        await actualizar();
      };
    },
  });
}
