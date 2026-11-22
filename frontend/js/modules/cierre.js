import { api } from '../api.js?v=5';
import { CONFIG } from '../config.js?v=5';
import { formatDateES, formatSpaceInt, formatNumber, tablaDatos, openModal, showToast } from '../utils.js?v=5';

export const trimestres = ['I', 'II', 'III', 'IV'];

export async function renderCierre(container) {
  let cierres = await api.getCierres();
  const hoy = CONFIG.REFERENCE_DATE;
  const actual = Number(hoy.slice(0, 4));
  let anio = actual;
  let trimestre = Math.ceil(Number(hoy.slice(5, 7)) / 3);

  const paint = () => {
    if (!container.isConnected) return;
    const cierre = cierres.find(c => c.anio === anio && c.trimestre === trimestre);
    const filas = cierre?.unidades || [];
    const mesInicial = (trimestre - 1) * 3 + 1;
    const desde = `${anio}-${String(mesInicial).padStart(2, '0')}-01`;
    const hasta = `${anio}-${String(trimestre * 3).padStart(2, '0')}-${[31, 30, 30, 31][trimestre - 1]}`;
    container.innerHTML = `<section class="card">
      <div class="filters-bar"><label>Año <select class="select" name="anio">
        ${Array.from({length: actual - 1999}, (_, i) => actual - i).map(a => `<option ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}
      </select></label><label>Trimestre <select class="select" name="trimestre">
        ${trimestres.map((t, i) => `<option value="${i + 1}" ${i + 1 === trimestre ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label></div>
      <h2 class="card-title">${trimestres[trimestre - 1]} trimestre de ${anio}</h2>
      <p>${formatDateES(desde)} al ${formatDateES(hasta)}</p>
      ${cierre ? `<p>Cerrado el ${formatDateES(cierre.fecha_cierre)}</p>
        <p>Los cambios en vales y turnos actualizan el cierre guardado.</p>
        ${tablaDatos(['Unidad', 'Km recorridos', 'Galones', 'Rendimiento (km/gal)', 'Km al cierre'], filas.map(u =>
          [u.placa, formatSpaceInt(u.km_recorridos), formatNumber(u.galones, 2), formatNumber(u.rendimiento, 2), formatSpaceInt(u.km_acumulado)]))}`
        : '<p>Sin cierre registrado para este trimestre.</p>'}
      <div class="modal-actions"><button class="btn btn-primary" data-guardar ${desde > hoy ? 'disabled' : ''}>
        ${cierre ? 'Actualizar cierre' : 'Cerrar trimestre'}</button></div></section>`;
    container.querySelector('[name=anio]').onchange = e => { anio = Number(e.target.value); paint(); };
    container.querySelector('[name=trimestre]').onchange = e => { trimestre = Number(e.target.value); paint(); };
    const boton = container.querySelector('[data-guardar]');
    const guardar = async (btn, close) => {
      btn.disabled = true;
      try {
        if (cierre) await api.actualizarCierre(anio, trimestre);
        else await api.cerrarTrimestre(anio, trimestre);
        close?.();
        cierres = await api.getCierres();
        paint();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    };
    boton.onclick = () => {
      if (cierre) return guardar(boton);
      openModal({
        title: `¿Cerrar el ${trimestres[trimestre - 1]} trimestre de ${anio}?`,
        bodyHtml: `<p>Se guardará el cierre del ${formatDateES(desde)} al ${formatDateES(hasta)}.</p>
          <div class="modal-actions"><button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>
          <button class="btn btn-primary" id="confirmar-cierre">Confirmar cierre</button></div>`,
        onMount(close) {
          const confirmar = document.getElementById('confirmar-cierre');
          confirmar.onclick = () => guardar(confirmar, close);
        },
      });
    };
  };
  paint();
}
