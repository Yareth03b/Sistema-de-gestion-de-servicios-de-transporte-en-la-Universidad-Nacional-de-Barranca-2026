import { falloCampo } from '../validaciones.js?v=12';
import { api } from '../api.js?v=12';
import { mostrarErrorFormulario, limitarTabla, esBus, openModal, showToast, escapeHtml } from '../utils.js?v=12';

export async function renderConductores(container, searchQuery = '') {
  const [conductores, unidades] = await Promise.all([api.getConductores(), api.getUnidades(true)]);

  const paint = () => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = conductores.filter((c) =>
      !q || c.nombres.toLowerCase().includes(q) || c.apellidos.toLowerCase().includes(q) || c.dni.includes(q)
    ).sort((a, b) => b.id_conductor - a.id_conductor);

    if (!container.isConnected) return;

    container.innerHTML = `
      <section class="card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>DNI</th>
                <th>NOMBRES Y APELLIDOS</th>
                <th>BREVETE</th>
                <th>UNIDAD ASIGNADA</th>
                <th>ESTADO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((c) => `
                <tr>
                  <td><strong>${escapeHtml(c.dni)}</strong></td>
                  <td>${escapeHtml(c.nombres)} ${escapeHtml(c.apellidos)}</td>
                  <td>${escapeHtml(c.brevete || '-')}</td>
                  <td><span class="plate-badge">${escapeHtml(c.placa)}</span></td>
                  <td><span class="pill ${c.activo ? 'pill-success' : 'pill-ok'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td><button class="btn-link" data-edit-cond="${c.id_conductor}">Editar</button>
                  ${c.activo && 'numero_bus' in c ? `<button type="button" class="btn-link" data-baja="${c.id_conductor}">Dar de baja</button>` : ''}</td>
                </tr>
              `).join('') || '<tr><td colspan="6">Sin registros para mostrar.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;

    limitarTabla(container.querySelector('table'), filtered.length);
    container.querySelectorAll('[data-baja]').forEach(btn => {
      btn.onclick = async () => {
        if (!window.confirm('¿Dar de baja este registro y conservar su historial?')) return;
        btn.disabled = true;
        try {
          await api.bajaConductor(Number(btn.dataset.baja));
          container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });
    container.querySelectorAll('[data-edit-cond]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = conductores.find((x) => x.id_conductor === Number(btn.dataset.editCond));
        openConductorModal(item);
      });
    });
  };

  const openConductorModal = (existing = null) => {
    openModal({
      title: existing ? 'Editar conductor' : 'Nuevo conductor',
      bodyHtml: `
        <form id="cond-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">DNI (8 dígitos)</label>
            <input name="dni" pattern="[0-9]{8}" inputmode="numeric" title="Ingresa los ocho dígitos del DNI" class="input" maxlength="8" value="${escapeHtml(existing?.dni || '')}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Brevete</label>
            <input name="brevete" class="input" value="${escapeHtml(existing?.brevete || '')}" placeholder="Q45123456" />
          </div>
          <div class="field-group">
            <label class="field-label">Nombres</label>
            <input name="nombres" class="input" value="${escapeHtml(existing?.nombres || '')}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Apellidos</label>
            <input name="apellidos" class="input" value="${escapeHtml(existing?.apellidos || '')}" required />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Unidad asignada</label>
            <select name="id_unidad" class="select">
              <option value="">Sin asignar</option>
              ${unidades.filter(u => (esBus(u) && u.activo) || u.id_unidad === existing?.id_unidad).map((u) => `<option value="${u.id_unidad}" ${existing?.id_unidad === u.id_unidad ? 'selected' : ''}>${escapeHtml(u.placa)} · ${escapeHtml(u.marca)}</option>`).join('')}
            </select>
          </div>
          <p id="cond-err" class="field-error hidden" style="grid-column:1/-1;"></p>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">${existing ? 'Guardar cambios' : 'Registrar conductor'}</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('cond-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            const dni = fd.get('dni').trim();
            if (conductores.some(c => c.id_conductor !== existing?.id_conductor && c.dni === dni)) throw falloCampo('dni', 'El DNI ya está registrado.');
            await api.saveConductor({
              dni: fd.get('dni').trim(),
              brevete: fd.get('brevete').trim(),
              nombres: fd.get('nombres').trim(),
              apellidos: fd.get('apellidos').trim(),
              id_unidad: fd.get('id_unidad') ? Number(fd.get('id_unidad')) : null,
            }, existing?.id_conductor || null);
            showToast(existing ? 'Conductor actualizado.' : 'Conductor registrado.', 'success');
            close();
            container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
          } catch (err) {
            const campo = ['V-07', 'V-08'].includes(err.codigo) ? 'dni' : err.codigo === 'V-10' ? 'id_unidad' : null;
            mostrarErrorFormulario(e.target, err, campo);
          }
        });
      },
    });
  };

  paint();
  return { onPrimaryAction: () => openConductorModal(null) };
}
