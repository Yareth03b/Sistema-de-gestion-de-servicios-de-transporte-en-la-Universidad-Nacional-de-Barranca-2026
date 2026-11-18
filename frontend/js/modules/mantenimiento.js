import { CONFIG } from '../config.js';
import { api } from '../api.js';
import { formatDateES, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js';

export async function renderMantenimiento(container, searchQuery = '') {
  let aviso = '';
  let [mants, unidades] = await Promise.all([
    api.getMantenimientos().catch(err => { aviso = err.message; return null; }),
    api.getUnidades(),
  ]);
  if (!mants) {
    const historiales = await Promise.all(unidades.map(u => api.getUnidadHistorial(u.id_unidad)));
    mants = historiales.flatMap(h => h.mantenimientos.map(m => ({ ...m, placa: h.unidad.placa })))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
  let filterTipo = 'all';

  const paint = () => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = mants.filter((m) => {
      const mT = filterTipo === 'all' || m.tipo === filterTipo;
      const mQ = !q || m.placa.toLowerCase().includes(q) || (m.detalle || '').toLowerCase().includes(q);
      return mT && mQ;
    });

    if (!container.isConnected) return;

    container.innerHTML = `
      ${aviso ? `<p role="alert">Listado general no disponible. Se muestran los historiales de las unidades activas. ${escapeHtml(aviso)}</p>` : ''}
      <section class="card">
        <div class="filters-bar">
          <div class="field-group">
            <label class="field-label" for="mant-tipo">Tipo</label>
            <select id="mant-tipo" class="select">
              <option value="all">Todos</option>
              <option value="Preventivo" ${filterTipo === 'Preventivo' ? 'selected' : ''}>Preventivo</option>
              <option value="Correctivo" ${filterTipo === 'Correctivo' ? 'selected' : ''}>Correctivo</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>UNIDAD</th>
                <th>TIPO</th>
                <th class="num-right">KILOMETRAJE</th>
                <th>DETALLE</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((m) => `
                <tr>
                  <td>${formatDateES(m.fecha)}</td>
                  <td><span class="plate-badge">${escapeHtml(m.placa)}</span></td>
                  <td><span class="pill ${m.tipo === 'Correctivo' ? 'pill-urgent' : 'pill-info'}">${escapeHtml(m.tipo)}</span></td>
                  <td class="num-right">${formatSpaceInt(m.km)} km</td>
                  <td>${escapeHtml(m.detalle || '-')}</td>
                </tr>
              `).join('') || '<tr><td colspan="5">Sin registros para mostrar.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="table-footer"><span>Mostrando ${filtered.length} registros de mantenimiento</span></div>
      </section>
    `;

    document.getElementById('mant-tipo').addEventListener('change', (e) => {
      filterTipo = e.target.value;
      paint();
    });
  };

  const openNuevoModal = () => {
    if (!unidades.length) {
      showToast('Primero registra al menos una unidad.', 'error');
      return;
    }
    const today = CONFIG.REFERENCE_DATE;
    openModal({
      title: 'Nuevo mantenimiento',
      bodyHtml: `
        <form id="mant-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Unidad</label>
            <select name="id_unidad" class="select" required>
              ${unidades.map((u) => `<option value="${u.id_unidad}">${escapeHtml(u.placa)} · ${escapeHtml(u.marca)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Tipo</label>
            <select name="tipo" class="select" required>
              <option value="Preventivo">Preventivo</option>
              <option value="Correctivo">Correctivo</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Fecha</label>
            <input name="fecha" type="date" class="input" max="${today}" value="${today}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Kilometraje</label>
            <input name="km" type="number" class="input" placeholder="Ej. 12500" required min="0" />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Detalle del trabajo realizado</label>
            <textarea name="detalle" class="textarea" required placeholder="Cambio de aceite, filtros, frenos..."></textarea>
          </div>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">Registrar mantenimiento</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('mant-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api.saveMantenimiento({
              id_unidad: Number(fd.get('id_unidad')),
              tipo: fd.get('tipo'),
              fecha: fd.get('fecha'),
              km: Number(fd.get('km')),
              detalle: fd.get('detalle').trim(),
            });
          } catch {
            return;
          }
          showToast('Mantenimiento registrado.', 'success');
          close();
          container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
        });
      },
    });
  };

  paint();
  return { onPrimaryAction: openNuevoModal };
}
