import { CONFIG } from '../config.js?v=6';
import { getSession } from './auth.js?v=6';
import { api } from '../api.js?v=6';
import { tablaDatos, formatHora, formatNumber, esBus, formatDateES, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js?v=6';

import { abrirSalida, proximosPorKilometraje } from './mantenimiento.js?v=6';

function vencimiento(doc) {
  if (!doc || doc.dias_para_vencer == null) return 'Sin vencimiento registrado';
  if (doc.vencido) return `Vencido hace ${Math.abs(doc.dias_para_vencer)} días`;
  return doc.dias_para_vencer === 0 ? 'Vence hoy' : `Vence en ${doc.dias_para_vencer} días`;
}

const tiposPrincipales = ['SOAT', 'Revisión Técnica'];

function documentoMasReciente(documentos, tipo) {
  return documentos.filter(d => d.tipo.localeCompare(tipo, 'es', { sensitivity: 'base' }) === 0)
    .sort((a, b) => b.fecha_vencimiento.localeCompare(a.fecha_vencimiento))[0];
}

function estadoUnidad(u) {
  return `<span class="pill ${u.activo && u.estado === 'Operativo' ? 'pill-success' : 'pill-info'}">${escapeHtml(u.estado || 'Sin estado')}</span>
    ${u.activo ? '' : '<strong>De baja</strong>'}
    ${u.en_taller ? `<span>Días en taller: ${formatSpaceInt(u.dias_en_taller)}</span>` : ''}`;
}

export async function renderUnidades(container, searchQuery = '') {
  const unidades = await api.getUnidades(true);
  let fichaSolicitada = 0;

  const paintList = () => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = unidades.filter((u) =>
      !q || u.placa.toLowerCase().includes(q) || (u.marca || '').toLowerCase().includes(q) || (u.modelo || '').toLowerCase().includes(q)
    );

    if (!container.isConnected) return;

    container.innerHTML = `<div class="tarjetas-flota">${filtered.map(u => `
      <article class="card unidad-card">
        <div class="card-header"><h2 class="card-title">${escapeHtml(u.placa)}</h2>${estadoUnidad(u)}</div>
        <p>${escapeHtml([u.tipo, u.marca, u.modelo].filter(Boolean).join(' · '))}</p>
        <strong>${formatSpaceInt(u.km_actual)} km</strong>
        ${esBus(u) ? `<div data-resumen-bus="${u.id_unidad}">Cargando documentos y preventivo…</div>` : '<p>Solo vales de combustible</p>'}
        <div class="acciones-unidad">
          <button class="btn-link" data-hist-unidad="${u.id_unidad}">Ver ficha e historial</button>
          <button class="btn-link" data-edit-unidad="${u.id_unidad}">Editar</button>
          ${u.en_taller ? `<button class="btn-link" data-salida-unidad="${u.id_unidad}">Salió del taller</button>` : ''}
          ${u.activo ? `<button class="btn-link" data-baja="${u.id_unidad}">Dar de baja</button>` : ''}
        </div>
      </article>`).join('') || '<p>Sin unidades para mostrar.</p>'}</div>`;

    container.querySelectorAll('[data-resumen-bus]').forEach(async resumen => {
      const id = Number(resumen.dataset.resumenBus);
      const u = unidades.find(item => item.id_unidad === id);
      try {
        const hist = await api.getUnidadHistorial(id);
        if (!resumen.isConnected) return;
        const [proximo] = proximosPorKilometraje([u], hist.mantenimientos);
        const faltan = proximo?.km_faltantes;
        const sinReferencia = proximo?.km_ultimo_preventivo > u.km_actual
          ? 'El km del último preventivo supera la lectura actual.' : 'Sin referencia de mantenimiento preventivo.';
        const preventivo = faltan == null ? sinReferencia
          : faltan < 0 ? `Mantenimiento excedido por ${formatSpaceInt(-faltan)} km` : `Mantenimiento en ${formatSpaceInt(faltan)} km`;
        resumen.innerHTML = `<p>${preventivo}</p><div class="etiquetas-documentos">${tiposPrincipales.map(tipo => {
          const doc = documentoMasReciente(hist.documentos, tipo);
          return `<span class="pill ${doc?.vencido ? 'pill-urgent' : 'pill-info'}">${tipo} · ${doc ? vencimiento(doc) : 'Sin registrar'}</span>`;
        }).join('')}</div>`;
      } catch (err) { resumen.textContent = err.message; }
    });

    container.querySelectorAll('[data-salida-unidad]').forEach(btn => {
      const u = unidades.find(u => u.id_unidad === Number(btn.dataset.salidaUnidad));
      btn.onclick = () => abrirSalida({ id_mantenimiento: u.id_mantenimiento_taller, fecha: u.taller_desde, placa: u.placa }, container);
    });
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
    const solicitud = ++fichaSolicitada;
    let hist;
    try {
      hist = await api.getUnidadHistorial(idUnidad);
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
    const u = hist.unidad;
    if (!container.isConnected || solicitud !== fichaSolicitada) return;
    container.innerHTML = `
      <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <button id="back-unidades" class="btn btn-ghost btn-sm">← Volver a unidades</button>
          <span class="plate-badge">${escapeHtml(u.placa)}</span>
          <strong>${escapeHtml(u.marca)} ${escapeHtml(u.modelo)}</strong>
          ${estadoUnidad({ ...unidades.find(item => item.id_unidad === idUnidad), estado: hist.estado_actual, en_taller: hist.en_taller })}
        </div>
        <div style="display:flex;gap:8px;">
          <button ${esBus(u) ? '' : 'disabled'} id="btn-nuevo-doc" class="btn btn-outline btn-sm">+ Documento</button>
          <button ${esBus(u) ? '' : 'disabled'} id="btn-nuevo-inc" class="btn btn-primary btn-sm">+ Nuevo incidente</button>
        </div>
      </div>

      <p class="card-meta">Código patrimonial: ${escapeHtml(u.codigo_patrimonial || '—')} · Capacidad: ${formatSpaceInt(u.capacidad)}</p>
      <div>
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Documentos de la unidad</h2>
          </div>
          ${esBus(u) ? tiposPrincipales.filter(tipo => !documentoMasReciente(hist.documentos, tipo)).map(tipo =>
            `<button class="btn-link" data-tipo-doc="${tipo}">Registrar ${tipo}</button>`).join(' ') : ''}
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>TIPO</th><th>NÚMERO</th><th>VENCIMIENTO</th><th></th></tr></thead>
            <tbody>
              ${hist.documentos.map((d) => `
                <tr>
                  <td><strong>${escapeHtml(d.tipo)}</strong></td>
                  <td>${escapeHtml(d.numero)}</td>
                  <td>${formatDateES(d.fecha_vencimiento)} · ${vencimiento(d)}</td>
                  <td>${esBus(u) ? `<button class="btn-link" data-edit-doc="${d.id_documento}">Editar documento</button>` : ''}</td>
                </tr>
              `).join('') || `<tr><td colspan="4" style="color:var(--text-secondary);">Sin documentos registrados.</td></tr>`}
            </tbody>
          </table></div>
        </section>

        <nav class="tabs-bar" aria-label="Historial de la unidad">
          ${['Turnos', 'Combustible', 'Mantenimientos', 'Incidentes'].map((nombre, i) =>
            `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-hist-tab="${nombre}" aria-pressed="${i === 0}">${nombre}</button>`).join('')}
        </nav>
        <section class="card" data-panel="Turnos">
          ${tablaDatos(['Fecha', 'Salida', 'Llegada', 'Km inicial', 'Km final', 'Km recorridos'],
            hist.turnos.map(t => [formatDateES(t.fecha), formatHora(t.hora_salida), formatHora(t.hora_llegada),
              formatSpaceInt(t.km_inicial), formatSpaceInt(t.km_final), formatSpaceInt(t.km_recorridos)]), 'Sin turnos registrados.')}
        </section>
        <section class="card hidden" data-panel="Combustible">
          ${tablaDatos(['Vale', 'Fecha', 'Km actual', 'Galones', 'Km consumidos', 'Rendimiento (km/gal)'],
            hist.abastecimientos.map(v => [v.nro_vale, formatDateES(v.fecha), formatSpaceInt(v.km_actual),
              formatNumber(v.galones, 2), formatSpaceInt(v.km_consumidos), formatNumber(v.rendimiento, 2)]), 'Sin vales registrados.')}
        </section>
        <section class="card hidden" data-panel="Incidentes">
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

      <section class="card hidden" data-panel="Mantenimientos">
        <div class="card-header">
          <h2 class="card-title">Historial de mantenimientos</h2>
        </div>
        <table class="data-table">
          <thead><tr><th>FECHA</th><th>TIPO</th><th class="num-right">KILOMETRAJE</th><th>DETALLE</th><th>SALIDA</th><th>DÍAS EN TALLER</th></tr></thead>
          <tbody>
            ${hist.mantenimientos.map((m) => `
              <tr>
                <td>${formatDateES(m.fecha)}</td>
                <td><span class="pill ${m.tipo === 'Correctivo' ? 'pill-urgent' : 'pill-info'}">${escapeHtml(m.tipo)}</span></td>
                <td class="num-right">${formatSpaceInt(m.km)} km</td>
                <td>${escapeHtml(m.detalle || '-')}</td><td>${m.fecha_salida ? formatDateES(m.fecha_salida) : 'En taller'}</td><td>${formatSpaceInt(m.dias_en_taller)}</td>
              </tr>
            `).join('') || `<tr><td colspan="6" style="color:var(--text-secondary);">Sin mantenimientos.</td></tr>`}
          </tbody>
        </table>
      </section>
    `;

    container.querySelectorAll('[data-hist-tab]').forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.histTab));
        container.querySelectorAll('[data-hist-tab]').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
      };
    });
    document.getElementById('back-unidades').addEventListener('click', () => container.dispatchEvent(new Event('actualizar-vista', { bubbles: true })));
    document.getElementById('btn-nuevo-inc').addEventListener('click', () => openIncidenteModal(idUnidad, null));
    document.getElementById('btn-nuevo-doc').addEventListener('click', () => openDocumentoModal(idUnidad));
    container.querySelectorAll('[data-edit-doc]').forEach(btn => {
      btn.onclick = () => openDocumentoModal(idUnidad, hist.documentos.find(d => d.id_documento === Number(btn.dataset.editDoc)));
    });
    container.querySelectorAll('[data-tipo-doc]').forEach(btn => {
      btn.onclick = () => openDocumentoModal(idUnidad, null, btn.dataset.tipoDoc);
    });
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

  const openDocumentoModal = (idUnidad, doc = null, tipo = 'SOAT') => {
    openModal({
      title: doc ? 'Editar documento' : 'Nuevo documento de unidad',
      bodyHtml: `
        <form id="doc-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Tipo</label>
            <select name="tipo" class="select">
              ${[...new Set([...tiposPrincipales, 'Tarjeta de Propiedad', doc?.tipo].filter(Boolean))].map(t =>
                `<option ${(doc?.tipo || tipo) === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Número</label>
            <input name="numero" class="input" maxlength="30" value="${escapeHtml(doc?.numero)}" required placeholder="CITV-2026-001" />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Fecha de vencimiento</label>
            <input name="fecha_vencimiento" type="date" class="input" min="2000-01-01" max="2100-12-31" value="${doc?.fecha_vencimiento.slice(0, 10) || ''}" required />
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
            }, doc?.id_documento);
          } catch (err) {
            showToast(err.message, 'error');
            return;
          }
          showToast(doc ? 'Documento actualizado.' : 'Documento registrado.', 'success');
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
              ${[...new Set([existing ? existing.estado_guardado ?? '' : 'Operativo', 'Operativo'])].map((s) => `<option value="${escapeHtml(s)}" ${existing?.estado_guardado === s ? 'selected' : ''}>${escapeHtml(s || 'Sin estado')}</option>`).join('')}
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
