import { api } from '../api.js?v=5';
import { mesActual, opcionesPeriodo, limitarTabla, rendimientoPeriodo, formatNumber, formatSpaceInt, escapeHtml } from '../utils.js?v=5';
import { renderCierre } from './cierre.js?v=5';

export async function renderReportes(container) {
  container.innerHTML = `<div class="tabs-bar">
    <button class="tab-btn active" data-reporte="unidad">Por unidad</button>
    <button class="tab-btn" data-reporte="cierre">Cierre trimestral</button>
  </div><div class="contenido-reporte"></div>`;
  const abrir = async tab => {
    const vista = document.createElement('div');
    vista.className = 'contenido-reporte';
    container.querySelector('.contenido-reporte').replaceWith(vista);
    container.querySelectorAll('[data-reporte]').forEach(b => b.classList.toggle('active', b.dataset.reporte === tab));
    try {
      if (tab === 'cierre') await renderCierre(vista);
      else await renderPorUnidad(vista);
    } catch (err) {
      if (vista.isConnected) vista.textContent = err.message;
    }
  };
  container.querySelectorAll('[data-reporte]').forEach(b => { b.onclick = () => abrir(b.dataset.reporte); });
  await abrir('unidad');
}

async function renderPorUnidad(container) {
  const [unidades, turnos, abasts] = await Promise.all([api.getUnidades(), api.getTurnos(), api.getAbastecimientos()]);
  let periodo = mesActual();
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
    container.innerHTML = `<section class="card">
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
        </section>`;
    limitarTabla(container.querySelector('table'), porUnidad.length);
    container.querySelector('#reporte-periodo').onchange = e => { periodo = e.target.value; paint(); };
  };
  paint();
}
