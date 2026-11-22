import { CONFIG } from '../config.js';
import { api } from '../api.js';
import { prepararCampos, mostrarErrorFormulario, limitarTabla, esBus, formatDateES, formatNumber, showToast, escapeHtml } from '../utils.js';

const EST_AREAS_KEY = 'unab_estimacion_areas';

function leerAreasLocales() {
  try {
    return JSON.parse(localStorage.getItem(EST_AREAS_KEY) || '{}');
  } catch {
    return {};
  }
}

function guardarAreaLocal(fecha, destino, areaNombre) {
  if (!areaNombre) return;
  try {
    const mapa = leerAreasLocales();
    mapa[`${fecha}|${destino}`] = areaNombre;
    localStorage.setItem(EST_AREAS_KEY, JSON.stringify(mapa));
  } catch {}
}

export async function renderEstimacion(container) {
  const [unidades, rutasYCostos, historial] = await Promise.all([
    api.getUnidades(),
    api.getRutasYCostos(),
    api.getEstimaciones(),
  ]);
  const rutas = rutasYCostos.rutas || [];
  const areas = rutasYCostos.areas || [];
  const areasLocales = leerAreasLocales();

  if (!container.isConnected) return;

  container.innerHTML = `
    <div class="split-2-col">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Calculadora de costo de viaje</h2>
        </div>
        <form id="est-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Unidad</label>
            <select name="id_unidad" class="select" required>
              ${unidades.filter(esBus).map((u) => `<option value="${u.id_unidad}">${escapeHtml(u.placa)} · ${escapeHtml(u.tipo)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Fecha estimada</label>
            <input name="fecha" type="date" class="input" value="${CONFIG.REFERENCE_DATE}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Ruta sugerida (opcional)</label>
            <select id="est-ruta-preset" class="select">
              <option value="">Personalizado</option>
              ${rutas.map((r) => `<option value="${r.km_referencia}" data-dest="${escapeHtml(r.punto_llegada)}">${escapeHtml(r.punto_salida)} → ${escapeHtml(r.punto_llegada)} (${r.km_referencia} km)</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Área solicitante (opcional)</label>
            <select name="id_area" id="est-area" class="select">
              <option value="">Sin área específica</option>
              ${areas.map((a) => `<option value="${a.id_area}">${escapeHtml(a.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Destino</label>
            <input name="destino" maxlength="100" id="est-destino" class="input" required placeholder="Ej. Lima - Ciudad Universitaria" />
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
            <div id="est-preview" class="input" style="display:flex;align-items:center;font-weight:700;color:var(--brand-primary);background:var(--brand-soft);">S/ 326.56</div>
          </div>
          <div style="grid-column:1/-1;display:flex;justify-content:flex-end;margin-top:8px;">
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
                <th>ÁREA</th>
                <th>DESTINO</th>
                <th class="num-right">DISTANCIA</th>
                <th class="num-right">COSTO (S/)</th>
              </tr>
            </thead>
            <tbody>
              ${historial.map((h) => {
                const areaTxt = h.area_nombre || areasLocales[`${String(h.fecha || '').slice(0, 10)}|${h.destino}`] || '—';
                return `
                <tr>
                  <td>${formatDateES(h.fecha)}</td>
                  <td>${escapeHtml(areaTxt)}</td>
                  <td>${escapeHtml(h.destino)}</td>
                  <td class="num-right">${h.distancia_km} km</td>
                  <td class="num-right"><strong>S/ ${formatNumber(h.costo_estimado, 2)}</strong></td>
                </tr>
              `;
              }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);">Aún no hay estimaciones guardadas.</td></tr>`}
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
    previewEl.textContent = `S/ ${formatNumber(costo, 2)}`;
    return +costo.toFixed(2);
  };

  calc();
  [kmEl, rendEl, precioEl].forEach((el) => el.addEventListener('input', calc));

  document.getElementById('est-ruta-preset').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (e.target.value) {
      kmEl.value = Number(e.target.value) * 2;
      document.getElementById('est-destino').value = opt.dataset.dest || '';
      calc();
    }
  });

  const form = document.getElementById('est-form');
  prepararCampos(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const areaSel = document.getElementById('est-area');
    const idArea = fd.get('id_area') ? Number(fd.get('id_area')) : null;
    const areaNombre = idArea && areaSel.selectedOptions[0] ? areaSel.selectedOptions[0].textContent : '';
    const fecha = fd.get('fecha');
    const destino = fd.get('destino').trim();

    try {
      await api.saveEstimacion({
        id_unidad: Number(fd.get('id_unidad')),
        id_area: idArea,
        fecha,
        destino,
        distancia_km: Number(fd.get('distancia_km')),
        rendimiento_promedio: Number(fd.get('rendimiento_promedio')),
        precio_galon: Number(fd.get('precio_galon')),
      });
      guardarAreaLocal(fecha, destino, areaNombre);
    } catch (err) {
      mostrarErrorFormulario(form, err);
      return;
    }
    showToast('Estimación guardada.', 'success');
    container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
  });
}
