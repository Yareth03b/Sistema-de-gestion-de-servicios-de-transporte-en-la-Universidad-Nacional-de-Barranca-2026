import { api } from '../api.js';
import { formatDateES, formatNumber, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js';

export async function renderCombustible(container, searchQuery = '') {
  const [abasts, unidades, conductores, areasData] = await Promise.all([
    api.getAbastecimientos(),
    api.getUnidades(),
    api.getConductores(),
    api.getRutasYCostos(),
  ]);
  const areas = areasData.areas;

  let filterUnidad = 'all';
  let filterArea = 'all';

  const paint = () => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = abasts.filter((a) => {
      const mU = filterUnidad === 'all' || String(a.id_unidad) === filterUnidad;
      const mA = filterArea === 'all' || String(a.id_area) === filterArea;
      const mQ = !q || a.nro_vale.toLowerCase().includes(q) || a.placa.toLowerCase().includes(q) || a.conductor.toLowerCase().includes(q);
      return mU && mA && mQ;
    });

    container.innerHTML = `
      <section class="card">
        <div class="filters-bar">
          <div class="field-group">
            <label class="field-label">Periodo</label>
            <select class="select">
              <option>Noviembre 2026</option>
              <option>Todos los periodos</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label" for="comb-unidad">Unidad</label>
            <select id="comb-unidad" class="select">
              <option value="all">Todas las unidades</option>
              ${unidades.map((u) => `<option value="${u.id_unidad}" ${filterUnidad === String(u.id_unidad) ? 'selected' : ''}>${escapeHtml(u.placa)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label" for="comb-area">Área</label>
            <select id="comb-area" class="select">
              <option value="all">Todas las áreas</option>
              ${areas.map((ar) => `<option value="${ar.id_area}" ${filterArea === String(ar.id_area) ? 'selected' : ''}>${escapeHtml(ar.nombre)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>N.° VALE</th>
                <th>FECHA</th>
                <th>UNIDAD</th>
                <th>CONDUCTOR</th>
                <th>ÁREA</th>
                <th class="num-right">KM ACTUAL</th>
                <th class="num-right">GALONES</th>
                <th class="num-right">KM CONSUMIDOS</th>
                <th class="num-right">RENDIMIENTO (km/gal)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((a) => `
                <tr>
                  <td><strong>${escapeHtml(a.nro_vale)}</strong></td>
                  <td>${formatDateES(a.fecha)}</td>
                  <td><span class="plate-badge">${escapeHtml(a.placa)}</span></td>
                  <td>${escapeHtml(a.conductor)}</td>
                  <td>${escapeHtml(a.area_nombre)}</td>
                  <td class="num-right">${formatSpaceInt(a.km_actual)}</td>
                  <td class="num-right">${formatNumber(a.galones, 2)}</td>
                  <td class="num-right">${formatSpaceInt(a.km_consumidos)}</td>
                  <td class="num-right"><strong>${formatNumber(a.rendimiento, 1)}</strong></td>
                  <td><button class="btn-link" data-edit-vale="${a.id_abastecimiento}">Editar</button></td>
                </tr>
              `).join('') || `<tr><td colspan="10" style="text-align:center;color:var(--text-secondary);">Sin vales registrados.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <span>Mostrando ${filtered.length} de ${abasts.length} vales</span>
        </div>
      </section>
    `;

    document.getElementById('comb-unidad').addEventListener('change', (e) => { filterUnidad = e.target.value; paint(); });
    document.getElementById('comb-area').addEventListener('change', (e) => { filterArea = e.target.value; paint(); });
    container.querySelectorAll('[data-edit-vale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = abasts.find((x) => x.id_abastecimiento === Number(btn.dataset.editVale));
        openValeModal(item);
      });
    });
  };

  const openValeModal = (existing = null) => {
    openModal({
      title: existing ? 'Editar vale de combustible' : 'Nuevo vale de combustible',
      bodyHtml: `
        <form id="vale-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">N.° de vale</label>
            <input name="nro_vale" class="input" placeholder="001-0457" value="${escapeHtml(existing?.nro_vale || '')}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Fecha</label>
            <input name="fecha" type="date" class="input" value="${existing?.fecha || '2026-11-12'}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Unidad</label>
            <select name="id_unidad" class="select" required>
              ${unidades.map((u) => `<option value="${u.id_unidad}" ${existing?.id_unidad === u.id_unidad ? 'selected' : ''}>${escapeHtml(u.placa)} · ${escapeHtml(u.marca)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Conductor</label>
            <select name="id_conductor" class="select" required>
              ${conductores.map((c) => `<option value="${c.id_conductor}" ${existing?.id_conductor === c.id_conductor ? 'selected' : ''}>${escapeHtml(c.nombres)} ${escapeHtml(c.apellidos)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Área solicitante</label>
            <select name="id_area" class="select">
              ${areas.map((ar) => `<option value="${ar.id_area}" ${existing?.id_area === ar.id_area ? 'selected' : ''}>${escapeHtml(ar.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Tipo de combustible</label>
            <select name="tipo_combustible" class="select" required>
              <option value="Diésel B5" ${existing?.tipo_combustible === 'Diésel B5' ? 'selected' : ''}>Diésel B5</option>
              <option value="Gasohol 95" ${existing?.tipo_combustible === 'Gasohol 95' ? 'selected' : ''}>Gasohol 95</option>
              <option value="Gasohol 90" ${existing?.tipo_combustible === 'Gasohol 90' ? 'selected' : ''}>Gasohol 90</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Km actual</label>
            <input name="km_actual" type="number" class="input" value="${existing?.km_actual ?? 186026}" required min="0" />
          </div>
          <div class="field-group">
            <label class="field-label">Galones</label>
            <input name="galones" type="number" step="0.01" class="input" value="${existing?.galones ?? ''}" placeholder="Ej. 45.00" required />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Observaciones</label>
            <textarea name="observaciones" class="textarea">${escapeHtml(existing?.observaciones || '')}</textarea>
          </div>
          <p id="vale-err" class="field-error hidden" style="grid-column:1/-1;"></p>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">${existing ? 'Guardar cambios' : 'Registrar vale'}</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('vale-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const errEl = document.getElementById('vale-err');
          const galones = Number(fd.get('galones'));
          if (!galones || galones <= 0) {
            errEl.textContent = 'Error: los galones deben ser mayores a 0.';
            errEl.classList.remove('hidden');
            e.target.querySelector('[name="galones"]').classList.add('is-error');
            return;
          }
          const payload = {
            nro_vale: fd.get('nro_vale').trim(),
            fecha: fd.get('fecha'),
            id_unidad: Number(fd.get('id_unidad')),
            id_conductor: Number(fd.get('id_conductor')),
            id_area: Number(fd.get('id_area')),
            tipo_combustible: fd.get('tipo_combustible'),
            km_actual: Number(fd.get('km_actual')),
            galones,
            observaciones: fd.get('observaciones'),
          };
          try {
            await api.saveAbastecimiento(payload, existing?.id_abastecimiento || null);
            showToast(existing ? 'Vale actualizado.' : 'Vale registrado.', 'success');
            close();
            renderCombustible(container, searchQuery);
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        });
      },
    });
  };

  paint();
  return { onPrimaryAction: () => openValeModal(null) };
}
