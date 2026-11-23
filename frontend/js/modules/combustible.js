import { falloCampo, campoRegistro, errorKilometraje, validarRegistro, confirmarPeriodo } from '../validaciones.js?v=11';
import { CONFIG } from '../config.js?v=11';
import { api } from '../api.js?v=11';
import { campoArea, altaArea, prepararArea } from './areas.js?v=11';
import { mostrarErrorFormulario, errorCampo, mesActual, opcionesPeriodo, limitarTabla, formatDateES, formatNumber, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js?v=11';

export async function renderCombustible(container, searchQuery = '', param, { filtros = {} } = {}) {
  const [abasts, unidades, conductores, areasData] = await Promise.all([
    api.getAbastecimientos(),
    api.getUnidades(true),
    api.getConductores(),
    api.getRutasYCostos(),
  ]);
  const areas = areasData.areas;

  let filterUnidad = unidades.some(u => String(u.id_unidad) === filtros['comb-unidad']) ? filtros['comb-unidad'] : 'all';
  let filterArea = areas.some(a => String(a.id_area) === filtros['comb-area']) ? filtros['comb-area'] : 'all';

  const turnos = await api.getTurnos();
  let periodo = filtros['filtro-periodo'] ?? mesActual();
  const paint = () => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = abasts.filter((a) => {
      const mU = filterUnidad === 'all' || String(a.id_unidad) === filterUnidad;
      const mA = filterArea === 'all' || String(a.id_area) === filterArea;
      const mQ = !q || a.nro_vale.toLowerCase().includes(q) || a.placa.toLowerCase().includes(q) || a.conductor.toLowerCase().includes(q);
      return (!periodo || a.fecha.startsWith(periodo)) && mU && mA && mQ;
    });

    if (!container.isConnected) return;

    container.innerHTML = `
      <section class="card">
        <div class="filters-bar">
          <div class="field-group">
            <label class="field-label" for="filtro-periodo">Periodo</label>
            <select id="filtro-periodo" class="select">
              ${opcionesPeriodo(abasts, periodo)}
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
                  <td>${escapeHtml(areas.find(area => area.id_area === a.id_area)?.nombre ?? a.area_nombre)}</td>
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
      </section>
    `;

    limitarTabla(container.querySelector('table'), filtered.length);
    document.getElementById('filtro-periodo').onchange = e => { periodo = e.target.value; paint(); };
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
    if (!existing && (!unidades.some(u => u.activo) || !conductores.some(c => c.activo))) {
      showToast('Primero registra al menos una unidad y un conductor.', 'error');
      return;
    }
    const today = CONFIG.REFERENCE_DATE;
    openModal({
      title: existing ? 'Editar vale de combustible' : 'Nuevo vale de combustible',
      bodyHtml: `
        <form id="vale-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">N.° de vale</label>
            <input name="nro_vale" maxlength="20" class="input" placeholder="001-0001" value="${escapeHtml(existing?.nro_vale || '')}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Fecha</label>
            <input name="fecha" type="date" class="input" max="${today}" value="${existing?.fecha?.slice(0, 10) || today}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Unidad</label>
            <select name="id_unidad" class="select" required>
              ${unidades.filter(u => u.activo || u.id_unidad === existing?.id_unidad).map((u) => `<option value="${u.id_unidad}" ${existing?.id_unidad === u.id_unidad ? 'selected' : ''}>${escapeHtml(u.placa)} · ${escapeHtml(u.marca)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Conductor</label>
            <select name="id_conductor" class="select" required>
              ${conductores.filter(c => c.activo || c.id_conductor === existing?.id_conductor).map((c) => `<option value="${c.id_conductor}" ${existing?.id_conductor === c.id_conductor ? 'selected' : ''}>${escapeHtml(c.nombres)} ${escapeHtml(c.apellidos)}</option>`).join('')}
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
          ${campoArea()}
          ${altaArea}
          <div class="field-group">
            <label class="field-label">Km actual</label>
            <input name="km_actual" type="number" class="input" value="${existing?.km_actual ?? ''}" placeholder="Ej. 12045" required min="0" />
          </div>
          <div class="field-group">
            <label class="field-label">Galones</label>
            <input name="galones" type="number" step="0.01" min="0.01" max="999999.99" class="input" value="${existing?.galones ?? ''}" placeholder="Ej. 45.00" required />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Observaciones (incluye el motivo)</label>
            <textarea name="observaciones" maxlength="300" class="textarea">${escapeHtml(existing?.observaciones || '')}</textarea>
          </div>
          <section class="registro-panel" aria-labelledby="calculo-titulo">
            <h3 id="calculo-titulo">Cálculo con el vale anterior</h3>
            <p>Km consumidos · <output name="consumidos">—</output></p>
            <p>Rendimiento · <output name="rendimiento">—</output></p>
            <p class="card-meta" id="referencia-vale"></p>
          </section>
          <p id="vale-err" class="field-error hidden" style="grid-column:1/-1;"></p>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">${existing ? 'Guardar cambios' : 'Registrar vale'}</button>
          </div>
        </form>
      `,
      onMount(close) {
        const form = document.getElementById('vale-form');
        prepararArea(form, areas, existing?.id_area, () => {
          if (!areas.some(a => String(a.id_area) === filterArea)) filterArea = 'all';
          paint();
        });
        const { fecha, id_unidad, km_actual, galones, consumidos, rendimiento } = form.elements;
        const guardar = form.querySelector('[type=submit]');
        const referencia = form.querySelector('#referencia-vale');
        const calcular = () => {
          const km = km_actual.valueAsNumber;
          const unidad = Number(id_unidad.value);
          const error = fecha.value && errorKilometraje({ id_unidad: unidad, fecha: fecha.value, km_actual: km }, existing, turnos, abasts);
          const invalido = !km_actual.validity.valid || Boolean(error);
          guardar.disabled = invalido;
          errorCampo(km_actual, error?.message || (km_actual.validity.badInput || km_actual.validity.stepMismatch ? 'Ingresa un kilometraje entero.' : ''));
          // GET /combustible ordena por fecha, km e id descendentes, incluso dentro del mismo día.
          const anterior = abasts.find(v => {
            if (v.id_unidad !== unidad || v.id_abastecimiento === existing?.id_abastecimiento) return false;
            if (v.fecha !== fecha.value) return v.fecha < fecha.value;
            if (v.km_actual !== km) return v.km_actual < km;
            return v.id_abastecimiento < (existing?.id_abastecimiento ?? Infinity);
          });
          const distancia = !invalido && anterior ? km - anterior.km_actual : null;
          consumidos.value = distancia == null ? '—' : formatSpaceInt(distancia) + ' km';
          rendimiento.value = distancia != null && galones.valueAsNumber > 0 && galones.validity.valid
            ? formatNumber(distancia / galones.valueAsNumber, 2) + ' km/gal' : '—';
          if (invalido && (km_actual.value || km_actual.validity.badInput)) referencia.textContent = 'Corrige el kilometraje para calcular y guardar.';
          else if (!fecha.value || !km_actual.value) referencia.textContent = 'Ingresa la fecha y el kilometraje del vale.';
          else referencia.textContent = anterior ? 'Vale anterior ' + anterior.nro_vale + ' · ' + formatSpaceInt(anterior.km_actual) + ' km'
            : 'Primer vale de la unidad. Sin lectura anterior para calcular.';
        };
        for (const campo of [fecha, id_unidad, km_actual, galones]) campo.addEventListener('input', calcular);
        calcular();
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (guardar.disabled) return;
          const fd = new FormData(form);
          const payload = {
            nro_vale: fd.get('nro_vale').trim(),
            fecha: fd.get('fecha'),
            id_unidad: Number(fd.get('id_unidad')),
            id_conductor: Number(fd.get('id_conductor')),
            id_area: fd.get('id_area') ? Number(fd.get('id_area')) : null,
            tipo_combustible: fd.get('tipo_combustible'),
            km_actual: Number(fd.get('km_actual')),
            galones: galones.valueAsNumber,
            observaciones: fd.get('observaciones'),
          };
          try {
            validarRegistro(payload, existing, unidades, conductores, turnos, abasts);
            if (abasts.some(a => a.id_abastecimiento !== existing?.id_abastecimiento && a.nro_vale.toUpperCase() === payload.nro_vale.toUpperCase())) throw falloCampo('nro_vale', 'Este vale ya está registrado.');
            if (!await confirmarPeriodo(payload.fecha, existing?.fecha)) return;
            await api.saveAbastecimiento(payload, existing?.id_abastecimiento || null);
            showToast(existing ? 'Vale actualizado.' : 'Vale registrado.', 'success');
            close();
            container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
          } catch (err) {
            mostrarErrorFormulario(form, err, campoRegistro(err));
          }
        });
      },
    });
  };

  paint();
  return { onPrimaryAction: () => openValeModal(null) };
}
