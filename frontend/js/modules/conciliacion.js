import { api } from '../api.js?v=6';
import { mesActual, tablaDatos, mostrarErrorFormulario, limitarTabla, formatNumber, openModal, showToast, escapeHtml } from '../utils.js?v=6';

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
  const mes = mesActual();
  const actual = Number(mes.slice(0, 4));
  const trimestreActual = Math.ceil(Number(mes.slice(5, 7)) / 3);
  container.insertAdjacentHTML('beforeend', `<section class="card"><h2 class="card-title">Detalle por unidad</h2>
    <div class="filters-bar"><label>Año <select class="select" name="anio-detalle">
    ${Array.from({ length: actual - 1999 }, (_, i) => `<option>${actual - i}</option>`).join('')}</select></label>
    <label>Trimestre <select class="select" name="trimestre-detalle">
    ${['I', 'II', 'III', 'IV'].map((t, i) => `<option value="${i + 1}" ${i + 1 === trimestreActual ? 'selected' : ''}>${t}</option>`).join('')}
    </select></label></div><div data-detalle aria-live="polite"></div></section>`);
  const anio = container.querySelector('[name=anio-detalle]');
  const trimestre = container.querySelector('[name=trimestre-detalle]');
  const detalle = container.querySelector('[data-detalle]');
  let solicitud = 0;
  const cargar = async () => {
    const actual = ++solicitud;
    detalle.textContent = 'Cargando detalle…';
    try {
      const d = await api.getDetalleConciliacion(anio.value, trimestre.value);
      if (!detalle.isConnected || solicitud !== actual) return;
      detalle.innerHTML = `<p>Vales: ${d.cantidad_vales} · Sistema: ${formatNumber(d.galones_sistema, 2)} gal ·
        ${d.reporte ? `Grifo: ${formatNumber(d.reporte.galones_total, 2)} gal · Diferencia: ${formatNumber(d.diferencia, 2)} gal` : 'Sin reporte del grifo'}</p>
        ${tablaDatos(['Unidad', 'Vales', 'Números de vale', 'Galones'], d.unidades.map(u =>
          [u.placa, u.cantidad_vales, u.nros_vale.join(', '), formatNumber(u.galones, 2)]))}`;
    } catch (err) { if (actual === solicitud) detalle.textContent = err.message; }
  };
  anio.onchange = trimestre.onchange = cargar;
  await cargar();
  const openGrifoModal = () => {
    openModal({
      title: 'Registrar reporte del grifo',
      bodyHtml: `
        <form id="grifo-form" class="form-grid-2">
          <div class="field-group">
            <label class="field-label">Año</label>
            <input name="anio" type="number" min="2000" class="input" value="${anio.value}" required />
          </div>
          <div class="field-group">
            <label class="field-label">Trimestre</label>
            <select name="trimestre" class="select">
              ${['I', 'II', 'III', 'IV'].map((t, i) => `<option value="${i + 1}" ${i + 1 === Number(trimestre.value) ? 'selected' : ''}>Trimestre ${t}</option>`).join('')}
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
