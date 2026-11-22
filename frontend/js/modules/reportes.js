import { api } from '../api.js?v=9';
import { mesActual, tablaDatos, limitarTabla, exportarCsv, formatNumber, formatSpaceInt, escapeHtml } from '../utils.js?v=9';
import { renderCierre } from './cierre.js?v=9';

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
  const unidades = await api.getUnidades(true);
  if (!container.isConnected) return;
  container.innerHTML = `<section class="card">
    <div class="filters-bar"><label>Periodo <input class="input" type="month" name="mes" value="${mesActual()}" max="${mesActual()}" required></label>
      <label>Unidad <select class="select" name="unidad"><option value="">Todas las unidades</option>
        ${unidades.map(u => `<option value="${u.id_unidad}">${escapeHtml(u.placa)}</option>`).join('')}</select></label>
      <label>Días <select class="select" name="dias"><option value="calendario">Calendario</option><option value="habiles">Hábiles</option></select></label>
    </div><p class="card-meta">Hábiles cuenta de lunes a viernes, sin descontar feriados.</p>
    <div data-resumen aria-live="polite"></div></section>`;
  const resultado = container.querySelector('[data-resumen]');
  const mes = container.querySelector('[name=mes]');
  const dias = container.querySelector('[name=dias]');
  const unidad = container.querySelector('[name=unidad]');
  let solicitud = 0;
  const consultar = async () => {
    const actual = ++solicitud;
    if (!mes.validity.valid) { resultado.textContent = 'Selecciona un mes hasta el actual.'; return; }
    resultado.textContent = 'Cargando reporte…';
    try {
      const reporte = await api.getReportePorUnidad(mes.value, unidad.value, dias.value);
      if (!resultado.isConnected || actual !== solicitud) return;
      const t = reporte.totales;
      const columnas = ['Unidad', 'Km del periodo', 'Galones', 'Vales', 'Rendimiento (km/gal)', 'Promedio diario (km/día)', 'Km acumulado'];
      const filas = [...reporte.unidades].sort((a, b) => b.id_unidad - a.id_unidad).map(u => [u.placa, u.km_periodo, u.galones, u.vales, u.rendimiento, u.promedio_diario, u.km_acumulado]);
      resultado.innerHTML = `<div class="resumen-totales">
        ${[['Km del periodo', formatSpaceInt(t.km_periodo)], ['Combustible (gal)', formatNumber(t.galones, 2)],
          ['Rendimiento de la flota (km/gal)', formatNumber(t.rendimiento_flota, 2)]].map(([label, valor]) =>
          `<div class="kpi-card"><span class="kpi-label">${label}</span><strong class="kpi-value">${valor}</strong></div>`).join('')}
        </div><div class="card-header"><h2 class="card-title">Resumen por unidad</h2>
        <button class="btn btn-outline" data-exportar>Exportar CSV</button></div>
        ${tablaDatos(columnas, filas.map(([placa, km, gal, vales, rend, diario, acum]) =>
          [placa, formatSpaceInt(km), formatNumber(gal, 2), vales, formatNumber(rend, 2), formatNumber(diario, 2), formatSpaceInt(acum)]))}`;
      limitarTabla(resultado.querySelector('table'), filas.length);
      resultado.querySelector('[data-exportar]').onclick = () => exportarCsv('reporte-' + mes.value + '.csv', [
        ['Periodo', mes.value, 'Días', dias.value], columnas, ...filas,
        ['Total', t.km_periodo, t.galones, t.vales, t.rendimiento_flota, t.promedio_diario, ''],
      ]);
    } catch (err) { if (actual === solicitud) resultado.textContent = err.message; }
  };
  for (const campo of [mes, dias, unidad]) campo.onchange = consultar;
  await consultar();
}
