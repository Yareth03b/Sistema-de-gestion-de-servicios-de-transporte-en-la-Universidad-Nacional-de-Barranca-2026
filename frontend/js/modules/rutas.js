import { api } from '../api.js';
import { mesActual, opcionesPeriodo, limitarTabla, mostrarErrorFormulario, formatNumber, openModal, showToast, escapeHtml } from '../utils.js';

export async function renderRutas(container, searchQuery = '') {
  const [{ rutas, areas }, vales] = await Promise.all([api.getRutasYCostos(), api.getAbastecimientos()]);
  let periodo = mesActual();
  const q = searchQuery.trim().toLowerCase();
  const filteredRutas = rutas.filter((r) =>
    !q || r.punto_salida.toLowerCase().includes(q) || r.punto_llegada.toLowerCase().includes(q)
  ).sort((a, b) => b.id_ruta - a.id_ruta);

  if (!container.isConnected) return;

  container.innerHTML = `
    <div class="split-2-col">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Rutas de referencia</h2>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>SALIDA</th>
                <th>LLEGADA</th>
                <th class="num-right">DISTANCIA (km)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRutas.map((r) => `
                <tr>
                  <td>${escapeHtml(r.punto_salida)}</td>
                  <td>${escapeHtml(r.punto_llegada)}</td>
                  <td class="num-right">${r.km_referencia}</td>
                </tr>
              `).join('') || '<tr><td colspan="3">Sin registros para mostrar.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Áreas solicitantes</h2>
            <label class="field-label" for="areas-periodo">Periodo</label>
            <select id="areas-periodo" class="select">${opcionesPeriodo(vales, periodo)}</select>
          </div>
          <button id="btn-nueva-area" class="btn btn-outline">+ Nueva área</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ÁREA</th>
                <th class="num-right">VALES</th>
                <th class="num-right">GALONES</th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  const [tablaRutas, tablaAreas] = container.querySelectorAll('table');
  limitarTabla(tablaRutas, filteredRutas.length);
  const pintarAreas = () => {
    const porArea = new Map();
    for (const vale of vales) {
      if (!vale.fecha.startsWith(periodo)) continue;
      const total = porArea.get(vale.id_area) || { vales: 0, galones: 0 };
      total.vales++;
      total.galones += Number(vale.galones);
      porArea.set(vale.id_area, total);
    }
    const filas = areas.filter(a => !q || a.nombre.toLowerCase().includes(q))
      .sort((a, b) => b.id_area - a.id_area);
    tablaAreas.tBodies[0].innerHTML = filas.map(a => `
      <tr>
        <td>${escapeHtml(a.nombre)}</td>
        <td class="num-right">${porArea.get(a.id_area)?.vales ?? 0}</td>
        <td class="num-right">${formatNumber(porArea.get(a.id_area)?.galones ?? 0, 2)}</td>
      </tr>`).join('') || '<tr><td colspan="3">Sin registros para mostrar.</td></tr>';
    limitarTabla(tablaAreas, filas.length);
  };
  pintarAreas();
  container.querySelector('#areas-periodo').onchange = e => { periodo = e.target.value; pintarAreas(); };

  const openNuevaRuta = () => {
    openModal({
      title: 'Nueva ruta',
      bodyHtml: `
        <form id="ruta-form" class="field-group" style="gap:14px;">
          <div class="field-group">
            <label class="field-label">Punto de salida</label>
            <input name="punto_salida" maxlength="100" class="input" required placeholder="Ej. La Florida" />
          </div>
          <div class="field-group">
            <label class="field-label">Punto de llegada</label>
            <input name="punto_llegada" maxlength="100" class="input" required placeholder="Ej. Pativilca" />
          </div>
          <div class="field-group">
            <label class="field-label">Distancia de referencia (km)</label>
            <input name="km_referencia" type="number" class="input" min="1" required />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar ruta</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('ruta-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api.saveRuta({
              punto_salida: fd.get('punto_salida').trim(),
              punto_llegada: fd.get('punto_llegada').trim(),
              km_referencia: Number(fd.get('km_referencia')),
            });
          } catch (err) {
            mostrarErrorFormulario(e.target, err);
            return;
          }
          showToast('Ruta agregada.', 'success');
          close();
          container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
        });
      },
    });
  };

  document.getElementById('btn-nueva-area').addEventListener('click', () => {
    openModal({
      title: 'Nueva área solicitante',
      bodyHtml: `
        <form id="area-form" class="field-group" style="gap:14px;">
          <div class="field-group">
            <label class="field-label">Nombre del área</label>
            <input name="nombre" maxlength="100" class="input" required placeholder="Ej. Dirección de Investigación" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar área</button>
          </div>
        </form>
      `,
      onMount(close) {
        document.getElementById('area-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api.saveArea({ nombre: fd.get('nombre').trim() });
          } catch (err) {
            mostrarErrorFormulario(e.target, err, err.status === 409 ? 'nombre' : null);
            return;
          }
          showToast('Área registrada.', 'success');
          close();
          container.dispatchEvent(new Event('actualizar-vista', { bubbles: true }));
        });
      },
    });
  });

  return { onPrimaryAction: openNuevaRuta };
}
