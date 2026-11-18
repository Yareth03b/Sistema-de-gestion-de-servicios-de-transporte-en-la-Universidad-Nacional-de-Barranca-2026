import { CONFIG } from '../config.js';
import { api } from '../api.js';
import { formatDateES, formatNumber, showToast, escapeHtml } from '../utils.js';

export async function renderEstimacion(container) {
  const [unidades, rutas, historial] = await Promise.all([
    api.getUnidades(),
    api.getRutasYCostos().then((r) => r.rutas),
    api.getEstimaciones(),
  ]);

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
              ${unidades.map((u) => `<option value="${u.id_unidad}">${escapeHtml(u.placa)} · ${escapeHtml(u.tipo)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Fecha estimada</label>
            <input name="fecha" type="date" class="input" value="${CONFIG.REFERENCE_DATE}" required />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Ruta sugerida (opcional)</label>
            <select id="est-ruta-preset" class="select">
              <option value="">Personalizado</option>
              ${rutas.map((r) => `<option value="${r.km_referencia}" data-dest="${escapeHtml(r.punto_llegada)}">${escapeHtml(r.punto_salida)} → ${escapeHtml(r.punto_llegada)} (${r.km_referencia} km)</option>`).join('')}
            </select>
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Destino</label>
            <input name="destino" id="est-destino" class="input" required placeholder="Ej. Lima - Ciudad Universitaria" />
          </div>
          <div class="field-group">
            <label class="field-label">Distancia total (km)</label>
            <input name="distancia_km" id="est-km" type="number" class="input" min="1" value="190" required />
          </div>
          <div class="field-group">
            <label class="field-label">Rendimiento promedio (km/gal)</label>
            <input name="rendimiento_promedio" id="est-rend" type="number" step="0.1" class="input" min="1" value="9.6" required />
          </div>
          <div class="field-group">
            <label class="field-label">Precio por galón (S/)</label>
            <input name="precio_galon" id="est-precio" type="number" step="0.01" class="input" min="1" value="16.50" required />
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
                <th>DESTINO</th>
                <th class="num-right">DISTANCIA</th>
                <th class="num-right">COSTO (S/)</th>
              </tr>
            </thead>
            <tbody>
              ${historial.map((h) => `
                <tr>
                  <td>${formatDateES(h.fecha)}</td>
                  <td>${escapeHtml(h.destino)}</td>
                  <td class="num-right">${h.distancia_km} km</td>
                  <td class="num-right"><strong>S/ ${formatNumber(h.costo_estimado, 2)}</strong></td>
                </tr>
              `).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);">Aún no hay estimaciones guardadas.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

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
      kmEl.value = e.target.value;
      document.getElementById('est-destino').value = opt.dataset.dest || '';
      calc();
    }
  });

  document.getElementById('est-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const costo_estimado = calc();
    try {
      await api.saveEstimacion({
        id_unidad: Number(fd.get('id_unidad')),
        fecha: fd.get('fecha'),
        destino: fd.get('destino').trim(),
        distancia_km: Number(fd.get('distancia_km')),
        rendimiento_promedio: Number(fd.get('rendimiento_promedio')),
        precio_galon: Number(fd.get('precio_galon')),
        costo_estimado,
      });
    } catch {
      return;
    }
    showToast('Estimación guardada.', 'success');
    container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
  });
}
