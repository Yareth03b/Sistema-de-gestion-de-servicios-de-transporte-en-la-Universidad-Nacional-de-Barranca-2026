import { falloCampo, campoRegistro, validarRegistro, confirmarPeriodo } from '../validaciones.js?v=4';
import { CONFIG } from '../config.js?v=4';
import { api } from '../api.js?v=4';
import { mostrarErrorFormulario, errorCampo, formatHora, mesActual, opcionesPeriodo, limitarTabla, esBus, formatDateES, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js?v=4';

export async function renderTurnos(container, searchQuery = '') {
  const [turnos, unidades, conductores, rutas] = await Promise.all([
    api.getTurnos(),
    api.getUnidades(true),
    api.getConductores(),
    api.getRutasYCostos().then((r) => r.rutas),
  ]);

  let filterBus = 'all';
  let filterText = searchQuery;

  const abasts = await api.getAbastecimientos();
  let periodo = mesActual();
  const paint = () => {
    const filtered = turnos.filter((t) => {
      const matchBus = filterBus === 'all' || String(t.id_unidad) === filterBus;
      const q = filterText.trim().toLowerCase();
      const matchText = !q ||
        t.placa.toLowerCase().includes(q) ||
        t.conductor.toLowerCase().includes(q) ||
        (t.ruta_texto || '').toLowerCase().includes(q);
      return (!periodo || t.fecha.startsWith(periodo)) && matchBus && matchText;
    });

    if (!container.isConnected) return;

    container.innerHTML = `
      <section class="card">
        <div class="filters-bar">
          <div class="field-group">
            <label class="field-label" for="filtro-periodo">Periodo</label>
            <select id="filtro-periodo" class="select">
              ${opcionesPeriodo(turnos, periodo)}
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
                  <td>${escapeHtml(formatHora(t.hora_salida))} – ${escapeHtml(formatHora(t.hora_llegada))}</td>
                  <td class="num-right">${formatSpaceInt(t.km_inicial)}</td>
                  <td class="num-right">${formatSpaceInt(t.km_final)}</td>
                  <td class="num-right"><strong>${formatSpaceInt(t.km_final - t.km_inicial)}</strong></td>
                  <td><button class="btn-link" data-edit-turno="${t.id_turno}">Editar</button></td>
                </tr>
              `).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);">No se encontraron turnos registrados.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;

    limitarTabla(container.querySelector('table'), filtered.length);
    document.getElementById('filtro-periodo').onchange = e => { periodo = e.target.value; paint(); };
    document.getElementById('turno-bus').addEventListener('change', (e) => {
      filterBus = e.target.value;
      paint();
    });
    document.getElementById('turno-search').addEventListener('input', (e) => {
      filterText = e.target.value;
      paint();
      document.getElementById('turno-search').focus();
    });
    container.querySelectorAll('[data-edit-turno]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = turnos.find((x) => x.id_turno === Number(btn.dataset.editTurno));
        openTurnoModal(item);
      });
    });
  };

  const openTurnoModal = (existing = null) => {
    if (!existing && (!unidades.some(u => esBus(u) && u.activo) || !conductores.some(c => c.activo))) {
      showToast('Primero registra al menos un bus y un conductor activos.', 'error');
      return;
    }
    const today = CONFIG.REFERENCE_DATE;
    openModal({
      title: existing ? 'Editar turno' : 'Nuevo turno',
      bodyHtml: `
        <form id="turno-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Unidad</label>
            <select name="id_unidad" class="select" required>
              ${unidades.filter(u => (u.activo && esBus(u)) || u.id_unidad === existing?.id_unidad).map((u) => `<option value="${u.id_unidad}" ${existing?.id_unidad === u.id_unidad ? 'selected' : ''}>${escapeHtml(u.placa)} · ${escapeHtml(u.marca)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Conductor</label>
            <select name="id_conductor" class="select" required>
              ${conductores.filter(c => c.activo || c.id_conductor === existing?.id_conductor).map((c) => `<option value="${c.id_conductor}" ${existing?.id_conductor === c.id_conductor ? 'selected' : ''}>${escapeHtml(c.nombres)} ${escapeHtml(c.apellidos)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Fecha</label>
            <input name="fecha" type="date" class="input" max="${today}" value="${existing?.fecha?.slice(0, 10) || today}" required />
          </div>
          <div class="turno-recorrido">Km recorridos · <output name="recorrido" for="turno-form-km_inicial turno-form-km_final">—</output></div>
          <div class="field-group">
            <label class="field-label">Hora salida</label>
            <input name="hora_salida" type="time" class="input" value="${formatHora(existing?.hora_salida) || '06:00'}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Hora llegada</label>
            <input name="hora_llegada" type="time" class="input" value="${formatHora(existing?.hora_llegada) || '14:00'}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Km inicial</label>
            <input name="km_inicial" type="number" class="input" value="${existing?.km_inicial ?? ''}" placeholder="Ej. 12000" required min="0" />
          </div>
          <div class="field-group">
            <label class="field-label">Km final</label>
            <input name="km_final" type="number" class="input" value="${existing?.km_final ?? ''}" placeholder="Ej. 12045" required min="1" />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Observaciones</label>
            <textarea name="observaciones" maxlength="300" class="textarea" placeholder="Novedades del turno">${escapeHtml(existing?.observaciones || '')}</textarea>
          </div>
          <fieldset class="registro-panel" ${existing && !Array.isArray(existing.id_rutas) ? 'disabled' : ''}>
            <legend>Rutas del turno</legend>
            ${existing && !Array.isArray(existing.id_rutas) ? '<p>Se conserva la ruta registrada: ' + escapeHtml(existing.ruta_texto) + '</p>' : ''}
            ${rutas.map(r => `<label><input type="checkbox" name="id_rutas" value="${r.id_ruta}" ${existing?.id_rutas?.includes(r.id_ruta) ? 'checked' : ''}>
              ${escapeHtml(r.punto_salida)} → ${escapeHtml(r.punto_llegada)} · ${formatSpaceInt(r.km_referencia)} km</label>`).join('') || 'Sin rutas de referencia registradas.'}
          </fieldset>
          <p id="turno-err" class="field-error hidden" style="grid-column:1/-1;"></p>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">${existing ? 'Guardar cambios' : 'Registrar turno'}</button>
          </div>
        </form>
      `,
      onMount(close) {
        const form = document.getElementById('turno-form');
        const { km_inicial, km_final, recorrido } = form.elements;
        const calcular = () => {
          const km = km_final.valueAsNumber - km_inicial.valueAsNumber;
          recorrido.value = km > 0 ? formatSpaceInt(km) + ' km' : '—';
          errorCampo(km_final, km <= 0 ? 'El km final debe superar el inicial.' : '');
        };
        km_inicial.addEventListener('input', calcular);
        km_final.addEventListener('input', calcular);
        calcular();
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const payload = {
            id_unidad: Number(fd.get('id_unidad')),
            id_conductor: Number(fd.get('id_conductor')),
            fecha: fd.get('fecha'),
            hora_salida: fd.get('hora_salida'),
            hora_llegada: fd.get('hora_llegada'),
            km_inicial: Number(fd.get('km_inicial')),
            km_final: Number(fd.get('km_final')),
            observaciones: fd.get('observaciones'),
          };
          try {
            const seleccion = fd.getAll('id_rutas').map(Number);
            // Conserva el orden y las repeticiones de rutas registradas al editar.
            const previas = existing?.id_rutas || [];
            if (!existing || Array.isArray(existing.id_rutas)) {
              payload.id_rutas = previas.filter(id => seleccion.includes(id))
                .concat(seleccion.filter(id => !previas.includes(id)));
            }
            validarRegistro(payload, existing, unidades, conductores, turnos, abasts);
            if (payload.km_final <= payload.km_inicial) throw falloCampo('km_final', 'El km final debe superar el inicial.');
            if (payload.hora_llegada <= payload.hora_salida) throw falloCampo('hora_llegada', 'La llegada debe ser posterior a la salida.');
            if (!await confirmarPeriodo(payload.fecha, existing?.fecha)) return;
            const resultado = await api.saveTurno(payload, existing?.id_turno || null);
            showToast(existing ? 'Turno actualizado.' : 'Turno registrado en bitácora.', 'success');
            if (resultado.aviso) showToast(resultado.aviso, 'warning');
            close();
            container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
          } catch (err) {
            mostrarErrorFormulario(form, err, campoRegistro(err, true));
          }
        });
      },
    });
  };

  paint();
  return { onPrimaryAction: () => openTurnoModal(null) };
}
