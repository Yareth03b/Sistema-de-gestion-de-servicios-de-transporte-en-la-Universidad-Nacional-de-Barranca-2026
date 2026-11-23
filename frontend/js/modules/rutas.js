import { api } from '../api.js?v=12';
import { limitarTabla, mostrarErrorFormulario, openModal, showToast, escapeHtml } from '../utils.js?v=12';

export async function renderRutas(container, searchQuery = '') {
  const { rutas } = await api.getRutasYCostos();
  const q = searchQuery.trim().toLowerCase();
  const filteredRutas = rutas.filter((r) =>
    !q || r.punto_salida.toLowerCase().includes(q) || r.punto_llegada.toLowerCase().includes(q)
  ).sort((a, b) => b.id_ruta - a.id_ruta);

  if (!container.isConnected) return;

  container.innerHTML = `
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
  `;

  limitarTabla(container.querySelector('table'), filteredRutas.length);

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

  return { onPrimaryAction: openNuevaRuta };
}
