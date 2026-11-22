import { api } from '../api.js';
import { mostrarErrorFormulario, mesActual, opcionesPeriodo, limitarTabla, rendimientoPeriodo, formatDateES, formatNumber, formatSpaceInt, openModal, showToast, escapeHtml } from '../utils.js?v=2';

export async function renderReportes(container) {
  let [cierres, unidades, turnos, abasts] = await Promise.all([
    api.getCierres(),
    api.getUnidades(),
    api.getTurnos(),
    api.getAbastecimientos(),
  ]);

  let periodo = mesActual();
  let activeTab = 'unidad';

  const paint = () => {
    const turnosPeriodo = turnos.filter(t => t.fecha.startsWith(periodo));
    const valesPeriodo = abasts.filter(v => v.fecha.startsWith(periodo));
    const porUnidad = [...unidades].sort((a, b) => b.id_unidad - a.id_unidad).map((u) => {
      const kmRec = turnosPeriodo.filter((t) => t.id_unidad === u.id_unidad).reduce((s, t) => s + (t.km_final - t.km_inicial), 0);
      const vales = valesPeriodo.filter(a => a.id_unidad === u.id_unidad);
      const gal = vales.reduce((s, a) => s + Number(a.galones), 0);
      const rend = rendimientoPeriodo(vales);
      return { placa: u.placa, tipo: u.tipo, kmRec, gal, rend, kmAcum: u.km_actual || 0 };
    });

    if (!container.isConnected) return;

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div class="tabs-bar">
          <button class="tab-btn ${activeTab === 'unidad' ? 'active' : ''}" data-tab="unidad">Por unidad</button>
          <button class="tab-btn ${activeTab === 'trimestral' ? 'active' : ''}" data-tab="trimestral">Cierres trimestrales</button>
        </div>
        <div style="display:flex;gap:10px;">
          <button id="btn-actualizar-rep" class="btn btn-outline">Actualizar</button>
          <button id="btn-cerrar-trim" class="btn btn-primary">Cerrar trimestre</button>
        </div>
      </div>

      ${activeTab === 'unidad' ? `
        <section class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Reporte consolidado por unidad</h2>
              <label class="field-label" for="reporte-periodo">Periodo</label>
              <select id="reporte-periodo" class="select">${opcionesPeriodo([...turnos, ...abasts], periodo)}</select>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>UNIDAD</th>
                  <th>TIPO</th>
                  <th class="num-right">KM RECORRIDOS</th>
                  <th class="num-right">GALONES</th>
                  <th class="num-right">RENDIMIENTO (km/gal)</th>
                  <th class="num-right">KM ACUMULADO</th>
                </tr>
              </thead>
              <tbody>
                ${porUnidad.map((r) => `
                  <tr>
                    <td><span class="plate-badge">${escapeHtml(r.placa)}</span></td>
                    <td>${escapeHtml(r.tipo)}</td>
                    <td class="num-right">${formatSpaceInt(r.kmRec)}</td>
                    <td class="num-right">${formatNumber(r.gal, 2)}</td>
                    <td class="num-right"><strong>${formatNumber(r.rend, 2)}</strong></td>
                    <td class="num-right">${formatSpaceInt(r.kmAcum)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="6">Sin registros para mostrar.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      ` : `
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Historial de cierres trimestrales</h2>
          </div>
          ${cierres.map((c) => `
            <div style="margin-bottom:24px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <strong>Año ${c.anio} · Trimestre ${c.trimestre}</strong>
                <button class="btn btn-outline" data-actualizar-cierre="${c.id_cierre}">Actualizar cierre</button>
                <span class="pill pill-ok">Cerrado el ${formatDateES(c.fecha_cierre)}</span>
              </div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>UNIDAD</th>
                      <th class="num-right">KM RECORRIDOS</th>
                      <th class="num-right">GALONES</th>
                      <th class="num-right">RENDIMIENTO</th>
                      <th class="num-right">KM ACUMULADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${[...(c.unidades || [])].sort((a, b) => b.id_unidad - a.id_unidad).map((u) => `
                      <tr>
                        <td><span class="plate-badge">${escapeHtml(u.placa)}</span></td>
                        <td class="num-right">${formatSpaceInt(u.km_recorridos)}</td>
                        <td class="num-right">${formatNumber(u.galones, 2)}</td>
                        <td class="num-right">${formatNumber(u.rendimiento, 2)}</td>
                        <td class="num-right">${formatSpaceInt(u.km_acumulado)}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="5">Sin registros para mostrar.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          `).join('') || '<p>Sin cierres trimestrales registrados.</p>'}
        </section>
      `}
    `;

    if (activeTab === 'unidad') {
      limitarTabla(container.querySelector('table'), porUnidad.length);
      container.querySelector('#reporte-periodo').onchange = e => { periodo = e.target.value; paint(); };
    } else {
      container.querySelectorAll('table').forEach((tabla, i) => limitarTabla(tabla, cierres[i].unidades?.length || 0));
    }
    container.querySelectorAll('[data-actualizar-cierre]').forEach(btn => {
      btn.onclick = async () => {
        const cierre = cierres.find(c => c.id_cierre === Number(btn.dataset.actualizarCierre));
        btn.disabled = true;
        try {
          await api.actualizarCierre(cierre.anio, cierre.trimestre);
          cierres = await api.getCierres();
          paint();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });
    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; paint(); });
    });

    document.getElementById('btn-actualizar-rep').addEventListener('click', () => {
      container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
    });

    document.getElementById('btn-cerrar-trim').addEventListener('click', () => {
      openModal({
        title: 'Aviso de cierre trimestral',
        bodyHtml: `
          <p style="margin-bottom:16px;color:var(--text-secondary);">
            Esta acción generará el corte oficial de kilometraje y combustible para el trimestre seleccionado. Las correcciones posteriores pueden recalcular el cierre.
          </p>
          <form id="cierre-form" class="form-grid-2">
            <div class="field-group">
              <label class="field-label">Año</label>
              <input name="anio" type="number" min="2000" class="input" value="${new Date().getFullYear()}" required />
            </div>
            <div class="field-group">
              <label class="field-label">Trimestre</label>
              <select name="trimestre" class="select">
                <option value="4" selected>Trimestre IV (Oct - Dic)</option>
                <option value="3">Trimestre III (Jul - Sep)</option>
                <option value="2">Trimestre II (Abr - Jun)</option>
                <option value="1">Trimestre I (Ene - Mar)</option>
              </select>
            </div>
            <p id="cierre-err" class="field-error hidden" style="grid-column:1/-1;"></p>
            <div class="modal-actions" style="grid-column:1/-1;">
              <button type="submit" class="btn btn-primary">Confirmar cierre</button>
            </div>
          </form>
        `,
        onMount(close) {
          document.getElementById('cierre-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
              await api.cerrarTrimestre(Number(fd.get('anio')), Number(fd.get('trimestre')));
              showToast('Trimestre cerrado y consolidado.', 'success');
              close();
              activeTab = 'trimestral';
              container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
            } catch (err) {
              mostrarErrorFormulario(e.target, err, err.codigo === 'V-06' ? 'trimestre' : null);
            }
          });
        },
      });
    });
  };

  paint();
}
