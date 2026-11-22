import { CONFIG } from '../config.js?v=4';
import { api } from '../api.js?v=4';
import { mostrarErrorFormulario, esBus, formatDateES, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js?v=4';

export async function renderMantenimiento(container, searchQuery = '') {
  const [mants, unidades] = await Promise.all([api.getMantenimientos(), api.getUnidades()]);
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
      <section class="card">
        <div class="filters-bar">
          <div class="field-group">
            <label class="field-label" for="mant-tipo">Tipo</label>
            <select id="mant-tipo" class="select">
              <option value="all">Todos</option>
              <option value="Preventivo" ${filterTipo === 'Preventivo' ? 'selected' : ''}>Preventivo</option>
              <option value="Predictivo" ${filterTipo === 'Predictivo' ? 'selected' : ''}>Predictivo</option>
              <option value="Correctivo" ${filterTipo === 'Correctivo' ? 'selected' : ''}>Correctivo</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>INGRESO</th><th>SALIDA</th><th>DÍAS EN TALLER</th>
                <th>UNIDAD</th>
                <th>TIPO</th>
                <th class="num-right">KILOMETRAJE</th>
                <th>DETALLE</th><th>FOTO</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((m) => `
                <tr>
                  <td>${formatDateES(m.fecha)}</td><td>${m.abierto ? "En taller" : formatDateES(m.fecha_salida)}</td><td>${formatSpaceInt(m.dias_en_taller)}</td>
                  <td><span class="plate-badge">${escapeHtml(m.placa)}</span></td>
                  <td><span class="pill ${m.tipo === 'Correctivo' ? 'pill-urgent' : 'pill-info'}">${escapeHtml(m.tipo)}</span></td>
                  <td class="num-right">${formatSpaceInt(m.km)} km</td>
                  <td>${escapeHtml(m.detalle || '-')}</td>
                  <td>${escapeHtml(m.foto || '—')}</td>
                  <td><button class="btn-link" data-salida="${m.id_mantenimiento}">${m.abierto ? 'Salió del taller' : 'Corregir salida'}</button>
                    ${m.abierto ? '' : `<button class="btn-link" data-deshacer="${m.id_mantenimiento}">Deshacer salida</button>`}</td>
                </tr>
              `).join('') || '<tr><td colspan="9">Sin registros para mostrar.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="table-footer"><span>Mostrando ${filtered.length} registros de mantenimiento</span></div>
      </section>
    `;

    container.querySelectorAll('[data-salida]').forEach(btn => {
      btn.onclick = () => abrirSalida(mants.find(m => m.id_mantenimiento === Number(btn.dataset.salida)), container);
    });
    container.querySelectorAll('[data-deshacer]').forEach(btn => {
      btn.onclick = async () => {
        if (!window.confirm('¿Deshacer la salida y volver a dejar el bus en taller?')) return;
        btn.disabled = true;
        try {
          await api.deshacerSalida(Number(btn.dataset.deshacer));
          container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
        } catch (err) { showToast(err.message, 'error'); btn.disabled = false; }
      };
    });
    document.getElementById('mant-tipo').addEventListener('change', (e) => {
      filterTipo = e.target.value;
      paint();
    });
  };

  const openNuevoModal = () => {
    if (!unidades.some(esBus)) {
      showToast('Primero registra al menos un bus.', 'error');
      return;
    }
    const today = CONFIG.REFERENCE_DATE;
    openModal({
      title: 'Ingreso al taller',
      bodyHtml: `
        <form id="mant-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Unidad</label>
            <select name="id_unidad" class="select" required>
              ${unidades.filter(esBus).map((u) => `<option value="${u.id_unidad}">${escapeHtml(u.placa)} · ${escapeHtml(u.marca)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Tipo</label>
            <select name="tipo" class="select" required>
              <option value="Preventivo">Preventivo</option>
              <option value="Predictivo">Predictivo</option>
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
            <textarea name="detalle" class="textarea" placeholder="Cambio de aceite, filtros, frenos..."></textarea>
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Enlace de la foto (opcional)</label>
            <input class="input" type="url" maxlength="260" name="foto" />
          </div>
          <p class="field-error hidden" role="alert"></p>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">Registrar ingreso</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('mant-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const guardar = e.target.querySelector('[type=submit]');
          guardar.disabled = true;
          try {
            await api.saveMantenimiento({
              id_unidad: Number(fd.get('id_unidad')),
              tipo: fd.get('tipo'),
              fecha: fd.get('fecha'),
              km: Number(fd.get('km')),
              detalle: fd.get('detalle').trim(),
              foto: fd.get('foto').trim() || null,
            });
          } catch (err) {
            mostrarErrorFormulario(e.target, err);
            guardar.disabled = false;
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

export function abrirSalida(mantenimiento, container) {
  const corregir = Boolean(mantenimiento.fecha_salida);
  openModal({
    title: (corregir ? 'Corregir salida' : 'Salió del taller') + ' · ' + mantenimiento.placa,
    bodyHtml: `<form id="salida-form">
      <div class="field-group"><label class="field-label">Fecha de salida</label>
        <input class="input" type="date" name="fecha_salida" min="${mantenimiento.fecha}" max="${CONFIG.REFERENCE_DATE}"
          value="${mantenimiento.fecha_salida || CONFIG.REFERENCE_DATE}" required></div>
      <p class="field-error hidden" role="alert"></p>
      <div class="modal-actions"><button class="btn btn-outline" type="button" data-cancelar>Cancelar</button>
        <button class="btn btn-primary" type="submit">${corregir ? 'Corregir fecha' : 'Registrar salida'}</button></div></form>`,
    onMount(close) {
      document.getElementById('salida-form').onsubmit = async e => {
        e.preventDefault();
        const form = e.target;
        if (corregir && !window.confirm('¿Confirmar la corrección de la fecha de salida?')) return;
        const guardar = form.querySelector('[type=submit]');
        guardar.disabled = true;
        try {
          await api.guardarSalida(mantenimiento.id_mantenimiento, form.elements.fecha_salida.value, corregir);
          close();
          showToast('Salida guardada.', 'success');
          container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
        } catch (err) {
          mostrarErrorFormulario(form, err);
          guardar.disabled = false;
        }
      };
    },
  });
}
