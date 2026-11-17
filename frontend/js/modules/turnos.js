import { api } from '../api.js';
import { formatDateES, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js';

export async function renderTurnos(container, searchQuery = '') {
  const [turnos, unidades, conductores, rutas] = await Promise.all([
    api.getTurnos(),
    api.getUnidades(),
    api.getConductores(),
    api.getRutasYCostos().then((r) => r.rutas),
  ]);

  let filterBus = 'all';
  let filterText = searchQuery;

  const paint = () => {
    const filtered = turnos.filter((t) => {
      const matchBus = filterBus === 'all' || String(t.id_unidad) === filterBus;
      const q = filterText.trim().toLowerCase();
      const matchText = !q ||
        t.placa.toLowerCase().includes(q) ||
        t.conductor.toLowerCase().includes(q) ||
        (t.ruta_texto || '').toLowerCase().includes(q);
      return matchBus && matchText;
    });

    container.innerHTML = `
      <section class="card">
        <div class="filters-bar">
          <div class="field-group">
            <label class="field-label" for="turno-periodo">Periodo</label>
            <select id="turno-periodo" class="select">
              <option value="2026-11">Noviembre 2026</option>
              <option value="all">Todos los periodos</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label" for="turno-bus">Bus</label>
            <select id="turno-bus" class="select">
              <option value="all">Todos los buses</option>
              ${unidades.map((u) => `<option value="${u.id_unidad}" ${filterBus === String(u.id_unidad) ? 'selected' : ''}>${escapeHtml(u.placa)} (${escapeHtml(u.tipo)})</option>`).join('')}
            </select>
          </div>
          <div class="field-group" style="flex:1;min-width:220px;">
            <label class="field-label" for="turno-search">Buscar</label>
            <input id="turno-search" class="input" type="search" placeholder="Buscar conductor o ruta" value="${escapeHtml(filterText)}" />
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>BUS</th>
                <th>CONDUCTOR</th>
                <th>RUTAS</th>
                <th>HORARIO</th>
                <th class="num-right">KM INICIAL</th>
                <th class="num-right">KM FINAL</th>
                <th class="num-right">RECORRIDO (km)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((t) => `
                <tr>
                  <td>${formatDateES(t.fecha)}</td>
                  <td><span class="plate-badge">${escapeHtml(t.placa)}</span></td>
                  <td>${escapeHtml(t.conductor)}</td>
                  <td>${escapeHtml(t.ruta_texto)}</td>
                  <td>${escapeHtml(t.hora_salida)} – ${escapeHtml(t.hora_llegada)}</td>
                  <td class="num-right">${formatSpaceInt(t.km_inicial)}</td>
                  <td class="num-right">${formatSpaceInt(t.km_final)}</td>
                  <td class="num-right"><strong>${formatSpaceInt(t.km_final - t.km_inicial)}</strong></td>
                  <td><button class="btn-link" data-edit-turno="${t.id_turno}">Editar</button></td>
                </tr>
              `).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);">No se encontraron turnos registrados.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <span>Mostrando ${filtered.length} de ${turnos.length} registros</span>
        </div>
      </section>
    `;

    document.getElementById('turno-bus').addEventListener('change', (e) => {
      filterBus = e.target.value;
      paint();
    });
    document.getElementById('turno-search').addEventListener('input', (e) => {
      filterText = e.target.value;
      paint();
    });
    container.querySelectorAll('[data-edit-turno]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = turnos.find((x) => x.id_turno === Number(btn.dataset.editTurno));
        openTurnoModal(item);
      });
    });
  };

  const openTurnoModal = (existing = null) => {
    openModal({
      title: existing ? 'Editar turno' : 'Nuevo turno',
      bodyHtml: `
        <form id="turno-form" class="form-grid-2">
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
            <label class="field-label">Fecha</label>
            <input name="fecha" type="date" class="input" value="${existing?.fecha || '2026-11-12'}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Ruta</label>
            <select name="id_ruta" class="select" required>
              ${rutas.map((r) => `<option value="${r.id_ruta}" ${existing?.id_ruta === r.id_ruta ? 'selected' : ''}>${escapeHtml(r.punto_salida)} ↔ ${escapeHtml(r.punto_llegada)} (${r.km_referencia} km)</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Hora salida</label>
            <input name="hora_salida" type="time" class="input" value="${existing?.hora_salida || '06:00'}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Hora llegada</label>
            <input name="hora_llegada" type="time" class="input" value="${existing?.hora_llegada || '14:00'}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Km inicial</label>
            <input name="km_inicial" type="number" class="input" value="${existing?.km_inicial ?? 98850}" required min="0" />
          </div>
          <div class="field-group">
            <label class="field-label">Km final</label>
            <input name="km_final" type="number" class="input" value="${existing?.km_final ?? 98880}" required min="1" />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Observaciones</label>
            <textarea name="observaciones" class="textarea" placeholder="Novedades del turno">${escapeHtml(existing?.observaciones || '')}</textarea>
          </div>
          <p id="turno-err" class="field-error hidden" style="grid-column:1/-1;"></p>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">${existing ? 'Guardar cambios' : 'Registrar turno'}</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('turno-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const payload = {
            id_unidad: Number(fd.get('id_unidad')),
            id_conductor: Number(fd.get('id_conductor')),
            id_ruta: Number(fd.get('id_ruta')),
            fecha: fd.get('fecha'),
            hora_salida: fd.get('hora_salida'),
            hora_llegada: fd.get('hora_llegada'),
            km_inicial: Number(fd.get('km_inicial')),
            km_final: Number(fd.get('km_final')),
            observaciones: fd.get('observaciones'),
          };
          try {
            await api.saveTurno(payload, existing?.id_turno || null);
            showToast(existing ? 'Turno actualizado.' : 'Turno registrado en bitácora.', 'success');
            close();
            renderTurnos(container, filterText);
          } catch (err) {
            const errEl = document.getElementById('turno-err');
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        });
      },
    });
  };

  paint();
  return { onPrimaryAction: () => openTurnoModal(null) };
}
