import { api } from '../api.js';
import { formatNumber, openModal, showToast, escapeHtml } from '../utils.js';

export async function renderRutas(container, searchQuery = '') {
  const { rutas, areas } = await api.getRutasYCostos();
  const q = searchQuery.trim().toLowerCase();
  const filteredRutas = rutas.filter((r) =>
    !q || r.punto_salida.toLowerCase().includes(q) || r.punto_llegada.toLowerCase().includes(q)
  );

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
        <div class="table-footer">
          <span>Mostrando ${filteredRutas.length} de ${rutas.length}</span>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Áreas solicitantes</h2>
            <p class="card-meta">Todos los periodos</p>
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
              ${areas.map((a) => `
                <tr>
                  <td>${escapeHtml(a.nombre)}</td>
                  <td class="num-right">${a.vales}</td>
                  <td class="num-right">${formatNumber(a.galones, 2)}</td>
                </tr>
              `).join('') || '<tr><td colspan="3">Sin registros para mostrar.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  const openNuevaRuta = () => {
    openModal({
      title: 'Nueva ruta de referencia',
      bodyHtml: `
        <form id="ruta-form" class="field-group" style="gap:14px;">
          <div class="field-group">
            <label class="field-label">Punto de salida</label>
            <input name="punto_salida" class="input" required placeholder="Ej. La Florida" />
          </div>
          <div class="field-group">
            <label class="field-label">Punto de llegada</label>
            <input name="punto_llegada" class="input" required placeholder="Ej. Pativilca" />
          </div>
          <div class="field-group">
            <label class="field-label">Distancia de referencia (km)</label>
            <input name="km_referencia" type="number" class="input" min="1" required />
          </div>
          <div class="modal-actions">
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
          } catch {
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
            <input name="nombre" class="input" required placeholder="Ej. Dirección de Investigación" />
          </div>
          <div class="modal-actions">
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
          } catch {
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
