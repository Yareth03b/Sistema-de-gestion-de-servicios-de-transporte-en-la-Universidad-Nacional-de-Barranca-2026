import { api } from '../api.js';
import { openModal, showToast, escapeHtml } from '../utils.js';

export async function renderConductores(container, searchQuery = '') {
  const [conductores, unidades] = await Promise.all([api.getConductores(), api.getUnidades()]);

  const paint = () => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = conductores.filter((c) =>
      !q || c.nombres.toLowerCase().includes(q) || c.apellidos.toLowerCase().includes(q) || c.dni.includes(q)
    );

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
                  <td><button class="btn-link" data-edit-cond="${c.id_conductor}">Editar</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="table-footer"><span>Mostrando ${filtered.length} de ${conductores.length} conductores</span></div>
      </section>
    `;

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
            <input name="dni" class="input" maxlength="8" value="${escapeHtml(existing?.dni || '')}" required />
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
              ${unidades.map((u) => `<option value="${u.id_unidad}" ${existing?.id_unidad === u.id_unidad ? 'selected' : ''}>${escapeHtml(u.placa)} · ${escapeHtml(u.marca)}</option>`).join('')}
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
            await api.saveConductor({
              dni: fd.get('dni').trim(),
              brevete: fd.get('brevete').trim(),
              nombres: fd.get('nombres').trim(),
              apellidos: fd.get('apellidos').trim(),
              id_unidad: fd.get('id_unidad') ? Number(fd.get('id_unidad')) : null,
            }, existing?.id_conductor || null);
            showToast(existing ? 'Conductor actualizado.' : 'Conductor registrado.', 'success');
            close();
            renderConductores(container, searchQuery);
          } catch (err) {
            const errEl = document.getElementById('cond-err');
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        });
      },
    });
  };

  paint();
  return { onPrimaryAction: () => openConductorModal(null) };
}
