import { CONFIG } from '../config.js?v=12';
import { api } from '../api.js?v=12';
import { prepararCampos, mostrarErrorFormulario, limitarTabla, esBus, formatDateES, formatNumber, openModal, showToast, escapeHtml } from '../utils.js?v=12';
import { renderSolicitudes, fechaHora } from './solicitudes.js?v=12';

const decimal = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function mostrarComparacion({ buses, fecha, pasajeros, fuente_cierre }, parametros, elegir) {
  const resumen = [formatDateES(fecha)];
  if (pasajeros != null) resumen.push(`${pasajeros} pasajeros`);
  resumen.push(`${formatNumber(parametros.distancia_km)} km`, `S/ ${decimal.format(parametros.precio_galon)} por galón`);

  openModal({
    title: 'Comparar buses',
    bodyHtml: `<div class="comparacion-buses">
      <p>${escapeHtml(resumen.join(' · '))}</p>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Bus</th><th>Capacidad</th><th>Rendimiento (km/gal)</th><th>Costo estimado</th><th>Estado y avisos</th></tr></thead>
        <tbody>${buses.map(bus => `<tr class="${bus.disponible ? '' : 'bus-no-disponible'}">
          <td><strong class="plate-badge">${escapeHtml(bus.placa)}</strong>
            ${bus.mas_economico ? '<span class="pill pill-success">Más económico</span>' : ''}</td>
          <td data-label="Capacidad">${escapeHtml(bus.capacidad ?? '—')}</td>
          <td data-label="Rendimiento (km/gal)">${bus.rendimiento == null ? '—' : decimal.format(bus.rendimiento)}
            ${bus.fuente_rendimiento ? `<small>${escapeHtml(bus.fuente_rendimiento)}</small>` : ''}</td>
          <td data-label="Costo estimado">${bus.costo_estimado == null ? '—' : 'S/ ' + decimal.format(bus.costo_estimado)}</td>
          <td><span class="pill ${bus.disponible ? 'pill-info' : 'pill-danger'}">${bus.disponible ? 'Disponible' : 'No disponible'}</span>
            ${bus.avisos.length ? `<ul>${bus.avisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join('')}</ul>` : ''}
            ${bus.disponible && bus.rendimiento > 0 ? `<button type="button" class="btn btn-outline btn-sm" data-usar="${bus.id_unidad}">Usar este bus</button>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="5">No hay buses activos para comparar.</td></tr>'}</tbody>
      </table></div>
      ${fuente_cierre == null ? '<p class="card-meta">Aún no hay cierre del trimestre anterior; el rendimiento se calcula con los vales de los últimos 3 meses.</p>' : ''}
    </div>`,
    onMount(close, capa) {
      capa.querySelectorAll('[data-usar]').forEach(boton => {
        boton.onclick = () => {
          elegir(buses.find(bus => bus.id_unidad === Number(boton.dataset.usar)));
          close();
        };
      });
    },
  });
}

export async function renderEstimacion(container, searchQuery, param, { filtros = {}, estado } = {}) {
  container.innerHTML = `<div class="tabs-bar">
    <button type="button" class="tab-btn" data-vista="solicitudes">Solicitudes</button>
    <button type="button" class="tab-btn" data-vista="calculadora">Calculadora</button>
  </div><div data-contenido></div>`;
  let vinculada;
  const abrir = async (vista, solicitud = null, borrador = null, estadoSolicitud = '') => {
    vinculada = solicitud;
    const contenido = document.createElement('div');
    contenido.dataset.contenido = '';
    container.querySelector('[data-contenido]').replaceWith(contenido);
    container.querySelectorAll('[data-vista]').forEach(b => {
      const activo = b.dataset.vista === vista;
      b.classList.toggle('active', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
    contenido.textContent = 'Cargando…';
    try {
      if (vista === 'solicitudes') await renderSolicitudes(contenido, s => abrir('calculadora', s), estadoSolicitud);
      else await renderCalculadora(contenido, solicitud, () => abrir(solicitud ? 'solicitudes' : 'calculadora'), borrador);
    } catch (err) {
      contenido.textContent = err.message;
    }
  };
  container.querySelectorAll('[data-vista]').forEach(b => {
    b.onclick = () => { if (!b.classList.contains('active')) abrir(b.dataset.vista); };
  });
  await abrir(estado?.tab ?? 'solicitudes', estado?.solicitud, estado?.borrador, filtros.estado);
  return { estado() {
    const form = container.querySelector('#est-form');
    return { tab: container.querySelector('.tab-btn.active').dataset.vista, solicitud: vinculada,
      borrador: form ? Object.fromEntries(new FormData(form)) : null };
  } };
}

async function renderCalculadora(container, solicitud, alGuardar, borrador) {
  const [unidades, rutasYCostos, historial] = await Promise.all([
    api.getUnidades(),
    api.getRutasYCostos(),
    api.getEstimaciones(),
  ]);
  const rutas = rutasYCostos.rutas || [];

  if (!container.isConnected) return;

  container.innerHTML = `
    <div class="split-2-col">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Calculadora de costo de viaje</h2>
        </div>
        ${solicitud ? `<dl class="solicitud-resumen">
          ${Object.entries({
            Solicitud: solicitud.codigo, Área: solicitud.area_nombre, Encargado: solicitud.encargado,
            Salida: fechaHora(solicitud.fecha_salida, solicitud.hora_salida),
            Regreso: fechaHora(solicitud.fecha_regreso, solicitud.hora_regreso),
            Procedencia: solicitud.lugar_procedencia, Destino: solicitud.lugar_destino,
            Pasajeros: solicitud.pasajeros, Motivo: solicitud.motivo,
            Estado: solicitud.estado, Observaciones: solicitud.observaciones || '—',
          }).map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${escapeHtml(valor)}</dd></div>`).join('')}
        </dl>` : ''}
        <form id="est-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Unidad</label>
            <select name="id_unidad" class="select" required>
              <option value="">Selecciona un bus</option>
              ${unidades.filter(esBus).map((u) => `<option value="${u.id_unidad}">${escapeHtml(u.placa)} · ${escapeHtml(u.tipo)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Fecha estimada</label>
            <input name="fecha" type="date" class="input" value="${solicitud?.fecha_salida || CONFIG.REFERENCE_DATE}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Ruta sugerida (opcional)</label>
            <select name="ruta_sugerida" id="est-ruta-preset" class="select">
              <option value="">Personalizado</option>
              ${rutas.map((r) => `<option value="${r.km_referencia}" data-dest="${escapeHtml(r.punto_llegada)}">${escapeHtml(r.punto_salida)} → ${escapeHtml(r.punto_llegada)} (${r.km_referencia} km)</option>`).join('')}
            </select>
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Destino</label>
            <input name="destino" maxlength="100" id="est-destino" class="input" required value="${escapeHtml(solicitud?.lugar_destino)}" placeholder="Ej. Lima - Ciudad Universitaria" />
          </div>
          <div class="field-group">
            <label class="field-label">Distancia de ida y vuelta (km)</label>
            <input name="distancia_km" id="est-km" type="number" class="input" min="1" value="190" required />
          </div>
          <div class="field-group">
            <label class="field-label">Rendimiento promedio (km/gal)</label>
            <input name="rendimiento_promedio" id="est-rend" type="number" step="0.01" class="input" min="0.01" value="9.6" required />
          </div>
          <div class="field-group">
            <label class="field-label">Precio por galón (S/)</label>
            <input name="precio_galon" id="est-precio" type="number" step="0.01" class="input" min="0.01" value="16.50" required />
          </div>
          <div class="field-group">
            <label class="field-label">Costo estimado</label>
            <div id="est-preview" class="input" style="display:flex;align-items:center;font-weight:700;color:var(--brand-primary);background:var(--brand-soft);"></div>
          </div>
          <div class="estimacion-acciones">
            <button type="button" class="btn btn-outline" data-comparar>Comparar buses</button>
            <button type="submit" class="btn btn-primary">Guardar estimación</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Estimaciones guardadas</h2>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>SOLICITUD</th>
                <th>ÁREA</th>
                <th>DESTINO</th>
                <th class="num-right">DISTANCIA</th>
                <th class="num-right">COSTO (S/)</th>
              </tr>
            </thead>
            <tbody>
              ${historial.map(h => `
                <tr>
                  <td>${formatDateES(h.fecha)}</td>
                  <td>${escapeHtml(h.codigo_solicitud || '—')}</td>
                  <td>${escapeHtml(h.area_nombre || '—')}</td>
                  <td>${escapeHtml(h.destino)}</td>
                  <td class="num-right">${h.distancia_km} km</td>
                  <td class="num-right"><strong>S/ ${formatNumber(h.costo_estimado, 2)}</strong></td>
                </tr>
              `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">Aún no hay estimaciones guardadas.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  limitarTabla(container.querySelector('table'), historial.length);
  const kmEl = document.getElementById('est-km');
  const rendEl = document.getElementById('est-rend');
  const precioEl = document.getElementById('est-precio');
  const previewEl = document.getElementById('est-preview');

  const calc = () => {
    const km = Number(kmEl.value) || 0;
    const rend = Number(rendEl.value);
    const precio = Number(precioEl.value) || 0;
    if (rend <= 0) {
      previewEl.textContent = '—';
      return null;
    }
    const costo = (km / rend) * precio;
    previewEl.textContent = `S/ ${decimal.format(costo)}`;
    return +costo.toFixed(2);
  };

  const form = document.getElementById('est-form');
  for (const [nombre, valor] of Object.entries(borrador || {})) form.elements[nombre].value = valor;
  calc();
  [kmEl, rendEl, precioEl].forEach((el) => el.addEventListener('input', calc));

  document.getElementById('est-ruta-preset').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (e.target.value) {
      kmEl.value = Number(e.target.value) * 2;
      if (!solicitud) document.getElementById('est-destino').value = opt.dataset.dest || '';
      calc();
    }
  });

  prepararCampos(form);
  const comparar = form.querySelector('[data-comparar]');
  comparar.onclick = async () => {
    const { fecha, id_unidad } = form.elements;
    if (!kmEl.reportValidity() || !precioEl.reportValidity() || (!solicitud && !fecha.reportValidity())) return;
    const parametros = {
      distancia_km: kmEl.valueAsNumber, precio_galon: precioEl.valueAsNumber,
      ...(solicitud ? { id_solicitud: solicitud.id_solicitud } : { fecha: fecha.value }),
    };
    comparar.disabled = true;
    comparar.textContent = 'Comparando…';
    try {
      const resultado = await api.compararBuses(parametros);
      if (!form.isConnected) return;
      if (kmEl.valueAsNumber !== parametros.distancia_km || precioEl.valueAsNumber !== parametros.precio_galon ||
          (!solicitud && fecha.value !== parametros.fecha)) {
        showToast('Los datos del viaje cambiaron. Vuelve a comparar los buses.');
        return;
      }
      mostrarComparacion(resultado, parametros, bus => {
        if (![...id_unidad.options].some(o => o.value === String(bus.id_unidad))) {
          id_unidad.add(new Option(bus.placa + ' · Bus', bus.id_unidad));
        }
        id_unidad.value = String(bus.id_unidad);
        rendEl.value = bus.rendimiento;
        for (const campo of [id_unidad, rendEl]) campo.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } catch (err) {
      if (form.isConnected) showToast(err.message, 'error');
    } finally {
      comparar.disabled = false;
      comparar.textContent = 'Comparar buses';
    }
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const boton = form.querySelector('[type=submit]');
    if (boton.disabled) return;
    boton.disabled = true;
    const fecha = fd.get('fecha');
    const destino = fd.get('destino').trim();

    try {
      await api.saveEstimacion({
        id_unidad: Number(fd.get('id_unidad')),
        id_solicitud: solicitud?.id_solicitud ?? null,
        fecha,
        destino,
        distancia_km: Number(fd.get('distancia_km')),
        rendimiento_promedio: Number(fd.get('rendimiento_promedio')),
        precio_galon: Number(fd.get('precio_galon')),
      });
    } catch (err) {
      boton.disabled = false;
      mostrarErrorFormulario(form, err);
      return;
    }
    showToast('Estimación guardada.', 'success');
    if (container.isConnected) await alGuardar();
  });
}
