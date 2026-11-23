import { falloCampo, campoRegistro, validarRegistro, confirmarPeriodo } from '../validaciones.js?v=11';
import { CONFIG } from '../config.js?v=11';
import { api } from '../api.js?v=11';
import { activarRefresco, mostrarErrorFormulario, errorCampo, formatHora, mesActual, mesesPeriodo, opcionesPeriodo, limitarTabla, esBus, formatDateES, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js?v=11';

function firmaTurnos(turnos) {
  return JSON.stringify(turnos.map(t => [t.id_turno, t.id_unidad, t.fecha, t.placa, t.conductor,
    t.ruta_texto, t.hora_salida, t.hora_llegada, t.km_inicial, t.km_final]));
}

export async function renderTurnos(container, searchQuery = '', param, { signal }) {
  const [iniciales, unidades, conductores, rutas, abasts] = await Promise.all([
    api.getTurnos(signal),
    api.getUnidades(true),
    api.getConductores(),
    api.getRutasYCostos().then(r => r.rutas),
    api.getAbastecimientos(),
  ]);
  if (signal.aborted) return;
  let turnos = iniciales;
  let firmaVisible;

  container.innerHTML = `
    <section class="card">
      <div class="filters-bar">
        <div class="field-group">
          <label class="field-label" for="filtro-periodo">Periodo</label>
          <select id="filtro-periodo" class="select">
            ${opcionesPeriodo(turnos, mesActual())}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="turno-bus">Bus</label>
          <select id="turno-bus" class="select">
            <option value="all">Todos los buses</option>
            ${unidades.map((u) => `<option value="${u.id_unidad}">${escapeHtml(u.placa)} (${escapeHtml(u.tipo)})</option>`).join('')}
          </select>
        </div>
        <div class="field-group" style="flex:1;min-width:220px;">
          <label class="field-label" for="turno-search">Buscar</label>
          <input id="turno-search" class="input" type="search" placeholder="Buscar conductor o ruta" value="${escapeHtml(searchQuery)}" />
        </div>
        <button type="button" class="btn btn-outline" data-actualizar>Actualizar</button>
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
          <tbody></tbody>
        </table>
      </div>
    </section>
  `;

  const mes = container.querySelector('#filtro-periodo');
  const bus = container.querySelector('#turno-bus');
  const buscar = container.querySelector('#turno-search');
  const boton = container.querySelector('[data-actualizar]');
  const tabla = container.querySelector('table');

  const actualizarPeriodos = () => {
    if (document.activeElement === mes || (CSS.supports('selector(select:open)') && mes.matches(':open'))) return;
    const periodo = mes.value;
    const meses = mesesPeriodo(turnos, periodo);
    // La primera opción corresponde a «Todos los periodos».
    if (mes.options.length !== meses.length + 1 || meses.some((m, i) => mes.options[i + 1].value !== m)) {
      mes.innerHTML = opcionesPeriodo(turnos, periodo);
    }
  };

  const pintarFilas = (mantenerExpansion = false) => {
    const filterBus = bus.value;
    const periodo = mes.value;
    const q = buscar.value.trim().toLowerCase();
    const filtered = turnos.filter((t) => {
      const matchBus = filterBus === 'all' || String(t.id_unidad) === filterBus;
      const matchText = !q ||
        t.placa.toLowerCase().includes(q) ||
        t.conductor.toLowerCase().includes(q) ||
        (t.ruta_texto || '').toLowerCase().includes(q);
      return (!periodo || t.fecha.startsWith(periodo)) && matchBus && matchText;
    });

    const firma = firmaTurnos(filtered);
    if (mantenerExpansion && firma === firmaVisible) return;
    firmaVisible = firma;
    const expandida = mantenerExpansion && container.querySelector('.table-footer button')?.getAttribute('aria-expanded') === 'true';
    tabla.tBodies[0].innerHTML = filtered.map((t) => `
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
    `).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);">No se encontraron turnos registrados.</td></tr>`;
    limitarTabla(tabla, filtered.length, expandida);
  };
  mes.onchange = bus.onchange = buscar.oninput = () => pintarFilas();
  tabla.onclick = e => {
    const editar = e.target.closest('[data-edit-turno]');
    if (editar) openTurnoModal(turnos.find(t => t.id_turno === Number(editar.dataset.editTurno)));
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
              <option value="">Selecciona un conductor</option>
              ${conductores.filter(c => c.activo || c.id_conductor === existing?.id_conductor).map((c) => `<option value="${c.id_conductor}" ${existing?.id_conductor === c.id_conductor ? 'selected' : ''}>${escapeHtml(c.nombres)} ${escapeHtml(c.apellidos)}</option>`).join('')}
            </select>
            <span id="turno-conductor-aviso" class="card-meta hidden" style="font-size:11.5px;color:var(--text-secondary);">Conductor asignado al bus seleccionado</span>
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
        const { id_unidad, id_conductor, km_inicial, km_final, recorrido } = form.elements;
        const avisoConductor = document.getElementById('turno-conductor-aviso');

        const actualizarAvisoConductor = () => {
          const unidadId = Number(id_unidad.value);
          const conductorId = Number(id_conductor.value);
          const asignado = conductores.find(c => c.id_unidad === unidadId && (c.activo || c.id_conductor === existing?.id_conductor));
          const coincide = Boolean(asignado && conductorId && asignado.id_conductor === conductorId);
          avisoConductor?.classList.toggle('hidden', !coincide);
        };

        const onCambioUnidad = () => {
          const unidadId = Number(id_unidad.value);
          const asignado = conductores.find(c => c.id_unidad === unidadId && (c.activo || c.id_conductor === existing?.id_conductor));
          if (asignado) {
            id_conductor.value = String(asignado.id_conductor);
          } else {
            id_conductor.value = '';
          }
          errorCampo(id_conductor, '');
          actualizarAvisoConductor();
        };

        id_unidad.addEventListener('change', onCambioUnidad);
        id_conductor.addEventListener('change', actualizarAvisoConductor);
        id_conductor.addEventListener('input', actualizarAvisoConductor);

        if (!existing) {
          onCambioUnidad();
        } else {
          actualizarAvisoConductor();
        }

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
          } catch (err) {
            mostrarErrorFormulario(form, err, campoRegistro(err, true));
          }
        });
      },
    });
  };

  pintarFilas();
  const actualizar = activarRefresco({
    signal, consultar: api.getTurnos,
    aplicar(datos) {
      const previos = turnos;
      turnos = datos; // El formulario de edición también necesita los campos que no aparecen en la tabla.
      actualizarPeriodos();
      pintarFilas(true);
      const anteriores = new Set(previos.map(t => t.id_turno));
      if (datos.some(t => !anteriores.has(t.id_turno))) showToast('Se actualizaron los turnos');
    },
    indicarCarga(cargando) {
      boton.disabled = cargando;
      boton.textContent = cargando ? 'Actualizando…' : 'Actualizar';
    },
  });
  boton.onclick = actualizar;
  return {
    actualizar, onPrimaryAction: () => openTurnoModal(null),
    buscar(texto) { buscar.value = texto; pintarFilas(); },
  };
}
