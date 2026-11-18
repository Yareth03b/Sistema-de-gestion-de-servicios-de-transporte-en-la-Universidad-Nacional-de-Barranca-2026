import { CONFIG } from '../config.js';
import { getSession } from './auth.js';
import { api } from '../api.js';
import { esBus, formatDateES, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js';

export async function renderUnidades(container, searchQuery = '') {
  const unidades = await api.getUnidades(true);

  const paintList = () => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = unidades.filter((u) =>
      !q || u.placa.toLowerCase().includes(q) || (u.marca || '').toLowerCase().includes(q) || (u.modelo || '').toLowerCase().includes(q)
    );

    if (!container.isConnected) return;

    container.innerHTML = `
      <section class="card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>PLACA</th>
                <th>TIPO</th>
                <th>MARCA / MODELO</th>
                <th>CÓD. PATRIMONIAL</th>
                <th class="num-right">CAPACIDAD</th>
                <th class="num-right">KM ACTUAL</th>
                <th>ESTADO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((u) => `
                <tr>
                  <td><span class="plate-badge">${escapeHtml(u.placa)}</span></td>
                  <td>${escapeHtml(u.tipo)} ${esBus(u) ? escapeHtml('numero_bus' in u ? u.numero_bus : u.placa.replace(/\D/g, '').match(/\d{3}$/)?.[0]) : ''}</td>
                  <td>${escapeHtml(u.marca)} · ${escapeHtml(u.modelo)}</td>
                  <td>${escapeHtml(u.codigo_patrimonial || '-')}</td>
                  <td class="num-right">${u.capacidad || '-'}</td>
                  <td class="num-right">${formatSpaceInt(u.km_actual || 0)} km</td>
                  <td><span class="pill ${u.estado === 'Operativo' ? 'pill-success' : 'pill-info'}">${escapeHtml(u.activo ? u.estado || 'Sin estado' : 'De baja')}</span></td>
                  <td style="white-space:nowrap;">
                    <button class="btn-link" data-hist-unidad="${u.id_unidad}">Ver historial</button>
                    <button class="btn-link" data-edit-unidad="${u.id_unidad}">Editar</button>
                  ${u.activo && 'numero_bus' in u ? `<button type="button" class="btn-link" data-baja="${u.id_unidad}">Dar de baja</button>` : ''}
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="8">Sin registros para mostrar.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <span>Mostrando ${filtered.length} de ${unidades.length} unidades</span>
        </div>
      </section>
    `;

    container.querySelectorAll('[data-baja]').forEach(btn => {
      btn.onclick = async () => {
        if (!window.confirm('¿Dar de baja este registro y conservar su historial?')) return;
        btn.disabled = true;
        try {
          await api.bajaUnidad(Number(btn.dataset.baja));
          container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });
    container.querySelectorAll('[data-edit-unidad]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = unidades.find((x) => x.id_unidad === Number(btn.dataset.editUnidad));
        openUnidadModal(u);
      });
    });

    container.querySelectorAll('[data-hist-unidad]').forEach((btn) => {
      btn.addEventListener('click', () => openHistorial(Number(btn.dataset.histUnidad)));
    });
  };

  const openHistorial = async (idUnidad) => {
    let hist;
    try {
      hist = await api.getUnidadHistorial(idUnidad);
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
    const u = hist.unidad;
    if (!container.isConnected) return;
    container.innerHTML = `
      <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <button id="back-unidades" class="btn btn-ghost btn-sm">← Volver a unidades</button>
          <span class="plate-badge">${escapeHtml(u.placa)}</span>
          <strong>${escapeHtml(u.marca)} ${escapeHtml(u.modelo)}</strong>
        </div>
        <div style="display:flex;gap:8px;">
          <button ${esBus(u) ? '' : 'disabled'} id="btn-nuevo-doc" class="btn btn-outline btn-sm">+ Documento</button>
          <button ${esBus(u) ? '' : 'disabled'} id="btn-nuevo-inc" class="btn btn-primary btn-sm">+ Nuevo incidente</button>
        </div>
      </div>

      <div class="dash-top-grid">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Documentos de la unidad</h2>
          </div>
          <table class="data-table">
            <thead><tr><th>TIPO</th><th>NÚMERO</th><th>VENCIMIENTO</th></tr></thead>
            <tbody>
              ${hist.documentos.map((d) => `
                <tr>
                  <td><strong>${escapeHtml(d.tipo)}</strong></td>
                  <td>${escapeHtml(d.numero)}</td>
                  <td>${formatDateES(d.fecha_vencimiento)}</td>
                </tr>
              `).join('') || `<tr><td colspan="3" style="color:var(--text-secondary);">Sin documentos registrados.</td></tr>`}
            </tbody>
          </table>
        </section>

        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Incidentes registrados</h2>
          </div>
          <div class="alert-list">
            ${hist.incidentes.map((inc) => `
              <div class="alert-row" style="justify-content:space-between;">
                <div>
                  <div class="alert-row-title">${formatDateES(inc.fecha)}</div>
                  <div class="alert-row-desc">${escapeHtml(inc.descripcion)}</div>
                  <div>${escapeHtml(inc.conductor ?? 'Sin conductor identificado')}</div>
                </div>
                <button class="btn-link" data-edit-inc="${inc.id_incidente}">Editar</button>
              </div>
            `).join('') || `<p class="card-meta">Sin incidentes reportados.</p>`}
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Historial de mantenimientos</h2>
        </div>
        <table class="data-table">
          <thead><tr><th>FECHA</th><th>TIPO</th><th class="num-right">KILOMETRAJE</th><th>DETALLE</th></tr></thead>
          <tbody>
            ${hist.mantenimientos.map((m) => `
              <tr>
                <td>${formatDateES(m.fecha)}</td>
                <td><span class="pill ${m.tipo === 'Correctivo' ? 'pill-urgent' : 'pill-info'}">${escapeHtml(m.tipo)}</span></td>
                <td class="num-right">${formatSpaceInt(m.km)} km</td>
                <td>${escapeHtml(m.detalle || '-')}</td>
              </tr>
            `).join('') || `<tr><td colspan="4" style="color:var(--text-secondary);">Sin mantenimientos.</td></tr>`}
          </tbody>
        </table>
      </section>
    `;

    document.getElementById('back-unidades').addEventListener('click', () => container.dispatchEvent(new Event('actualizar-vista', { bubbles: true })));
    document.getElementById('btn-nuevo-inc').addEventListener('click', () => openIncidenteModal(idUnidad, null));
    document.getElementById('btn-nuevo-doc').addEventListener('click', () => openDocumentoModal(idUnidad));
    container.querySelectorAll('[data-edit-inc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inc = hist.incidentes.find((x) => x.id_incidente === Number(btn.dataset.editInc));
        openIncidenteModal(idUnidad, inc);
      });
    });
  };

  const openIncidenteModal = (idUnidad, existing = null) => {
    openModal({
      title: existing ? 'Editar incidente' : 'Nuevo incidente',
      bodyHtml: `
        <form id="inc-form" class="field-group" style="gap:14px;">
          <div class="field-group">
            <label class="field-label">Fecha y hora</label>
            <input name="fecha" type="datetime-local" max="${CONFIG.REFERENCE_DATETIME}" class="input" value="${existing?.fecha?.slice(0, 16) || CONFIG.REFERENCE_DATETIME}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Descripción del incidente</label>
            <textarea name="descripcion" class="textarea" required placeholder="Describe lo ocurrido">${escapeHtml(existing?.descripcion || '')}</textarea>
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">${existing ? 'Guardar cambios' : 'Registrar incidente'}</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('inc-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api.saveIncidente({
              id_unidad: idUnidad,
              fecha: fd.get('fecha'),
              descripcion: fd.get('descripcion').trim(),
            }, existing?.id_incidente || null);
          } catch (err) {
            showToast(err.message, 'error');
            return;
          }
          showToast(existing ? 'Incidente actualizado.' : 'Incidente registrado.', 'success');
          close();
          openHistorial(idUnidad);
        });
      },
    });
  };

  const openDocumentoModal = (idUnidad) => {
    openModal({
      title: 'Nuevo documento de unidad',
      bodyHtml: `
        <form id="doc-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Tipo</label>
            <select name="tipo" class="select">
              <option value="SOAT">SOAT</option>
              <option value="Revisión Técnica">Revisión Técnica</option>
              <option value="Tarjeta de Propiedad">Tarjeta de Propiedad</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Número</label>
            <input name="numero" class="input" required placeholder="CITV-2026-001" />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Fecha de vencimiento</label>
            <input name="fecha_vencimiento" type="date" class="input" required />
          </div>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">Guardar documento</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('doc-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api.saveDocumento({
              id_unidad: idUnidad,
              tipo: fd.get('tipo'),
              numero: fd.get('numero').trim(),
              fecha_vencimiento: fd.get('fecha_vencimiento'),
            });
          } catch (err) {
            showToast(err.message, 'error');
            return;
          }
          showToast('Documento registrado.', 'success');
          close();
          openHistorial(idUnidad);
        });
      },
    });
  };

  const openUnidadModal = (existing = null) => {
    openModal({
      title: existing ? 'Editar unidad' : 'Nueva unidad',
      bodyHtml: `
        <form id="unidad-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Placa</label>
            <input name="placa" class="input" value="${escapeHtml(existing?.placa || '')}" placeholder="ABC-005" required />
          </div>
          <div class="field-group">
            <label class="field-label">Tipo</label>
            <select name="tipo" class="select">
              ${[...new Set(['Bus', 'Camioneta', 'Minivan', existing?.tipo].filter(Boolean))].map((t) => `<option value="${escapeHtml(t)}" ${existing?.tipo === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Marca</label>
            <input name="marca" class="input" value="${escapeHtml(existing?.marca || '')}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Modelo</label>
            <input name="modelo" class="input" value="${escapeHtml(existing?.modelo || '')}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Código patrimonial</label>
            <input name="codigo_patrimonial" class="input" value="${escapeHtml(existing?.codigo_patrimonial || '')}" />
          </div>
          <div class="field-group">
            <label class="field-label">Capacidad</label>
            <input name="capacidad" type="number" class="input" value="${existing ? existing.capacidad ?? '' : 40}" />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Estado</label>
            <select name="estado" class="select">
              ${[...new Set([existing ? existing.estado ?? '' : 'Operativo', 'Operativo', 'En mantenimiento'])].map((s) => `<option value="${escapeHtml(s)}" ${existing?.estado === s ? 'selected' : ''}>${escapeHtml(s || 'Sin estado')}</option>`).join('')}
            </select>
          </div>
          <p id="unidad-err" class="field-error hidden" style="grid-column:1/-1;"></p>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">${existing ? 'Guardar cambios' : 'Registrar unidad'}</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('unidad-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            if (unidades.some(u => u.id_unidad !== existing?.id_unidad && u.placa.toUpperCase() === fd.get('placa').trim().toUpperCase())) throw new Error('La placa ya está registrada.');
            await api.saveUnidad({
              id_usuario: getSession()?.id_usuario,
              placa: fd.get('placa').trim().toUpperCase(),
              tipo: fd.get('tipo'),
              marca: fd.get('marca').trim(),
              modelo: fd.get('modelo').trim(),
              codigo_patrimonial: fd.get('codigo_patrimonial').trim(),
              capacidad: fd.get('capacidad') ? Number(fd.get('capacidad')) : null,
              estado: fd.get('estado'),
            }, existing?.id_unidad || null);
            showToast(existing ? 'Unidad actualizada.' : 'Unidad registrada.', 'success');
            close();
            container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
          } catch (err) {
            const errEl = document.getElementById('unidad-err');
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        });
      },
    });
  };

  paintList();
  return { onPrimaryAction: () => openUnidadModal(null) };
}
