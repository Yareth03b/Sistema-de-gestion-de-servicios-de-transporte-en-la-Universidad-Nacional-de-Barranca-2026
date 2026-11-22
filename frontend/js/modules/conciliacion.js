import { api } from '../api.js?v=5';
import { mostrarErrorFormulario, limitarTabla, formatNumber, openModal, showToast, escapeHtml } from '../utils.js?v=5';

export async function renderConciliacion(container) {
  const reportes = await api.getConciliacion();

  if (!container.isConnected) return;

  container.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Conciliación con el grifo</h2>
          <p class="card-meta">Comparativa trimestral entre vales internos y facturación del grifo</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>AÑO</th>
              <th>TRIMESTRE</th>
              <th class="num-right">GALONES SISTEMA</th>
              <th class="num-right">GALONES GRIFO</th>
              <th class="num-right">DIFERENCIA</th>
              <th>ESTADO</th>
              <th>OBSERVACIONES</th>
            </tr>
          </thead>
          <tbody>
            ${reportes.map((r) => {
              const sis = Number(r.galones_sistema || 0);
              const grifo = Number(r.galones_total || 0);
              const diff = r.diferencia ?? +(grifo - sis).toFixed(2);
              const ok = Math.abs(diff) <= 0.5;
              return `
                <tr>
                  <td><strong>${r.anio}</strong></td>
                  <td>Trimestre ${r.trimestre}</td>
                  <td class="num-right">${formatNumber(sis, 2)} gal</td>
                  <td class="num-right">${formatNumber(grifo, 2)} gal</td>
                  <td class="num-right"><strong>${diff > 0 ? '+' : ''}${formatNumber(diff, 2)} gal</strong></td>
                  <td><span class="pill ${ok ? 'pill-success' : 'pill-info'}">${ok ? 'Conciliado' : 'Por revisar'}</span></td>
                  <td>${escapeHtml(r.observaciones || '-')}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="7">Sin registros para mostrar.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  limitarTabla(container.querySelector('table'), reportes.length);
  const openGrifoModal = () => {
    openModal({
      title: 'Registrar reporte del grifo',
      bodyHtml: `
        <form id="grifo-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Año</label>
            <input name="anio" type="number" min="2000" class="input" value="${new Date().getFullYear()}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Trimestre</label>
            <select name="trimestre" class="select">
              <option value="4">Trimestre IV</option>
              <option value="3">Trimestre III</option>
              <option value="2">Trimestre II</option>
              <option value="1">Trimestre I</option>
            </select>
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Total galones facturados por el grifo</label>
            <input name="galones_total" type="number" min="0" max="99999999.99" step="0.01" class="input" required placeholder="Ej. 1526.00" />
          </div>
          <div class="field-group" style="grid-column:1/-1;">
            <label class="field-label">Observaciones</label>
            <textarea name="observaciones" maxlength="300" class="textarea" placeholder="N.° de factura o detalle"></textarea>
          </div>
          <div class="modal-actions" style="grid-column:1/-1;">
            <button type="submit" class="btn btn-primary">Guardar reporte</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('grifo-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api.saveReporteGrifo({
              anio: Number(fd.get('anio')),
              trimestre: Number(fd.get('trimestre')),
              galones_total: Number(fd.get('galones_total')),
              observaciones: fd.get('observaciones').trim(),
            });
          } catch (err) {
            const campo = err.codigo === 'V-06' ? (err.message.includes('año') ? 'anio' : 'trimestre') : null;
            mostrarErrorFormulario(e.target, err, campo);
            return;
          }
          showToast('Reporte de grifo actualizado.', 'success');
          close();
          container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
        });
      },
    });
  };

  return { onPrimaryAction: openGrifoModal };
}
