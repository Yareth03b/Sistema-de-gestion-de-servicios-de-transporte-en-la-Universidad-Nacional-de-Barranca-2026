import { CONFIG } from './config.js';

export function formatNumber(n, decimals = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const num = Number(n || 0);
  return num.toLocaleString('es-PE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSpaceInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Math.round(Number(n || 0))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatDateES(isoDate) {
  if (!isoDate) return '-';
  const clean = isoDate.toString().slice(0, 10);
  const [y, m, d] = clean.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function formatHora(hora) {
  return hora?.slice(0, 5) || '';
}

export function mesActual() {
  return CONFIG.REFERENCE_DATE.slice(0, 7);
}

export function opcionesPeriodo(registros, periodo) {
  const meses = new Set([mesActual(), ...registros.map(r => r.fecha.slice(0, 7))]);
  const opciones = [...meses].sort().reverse().map(m => {
    const [anio, mes] = m.split('-');
    const nombre = new Date(Number(anio), Number(mes) - 1, 1).toLocaleString('es-PE', { month: 'long' });
    return `<option value="${m}" ${m === periodo ? 'selected' : ''}>${nombre[0].toUpperCase() + nombre.slice(1)} ${anio}</option>`;
  });
  return '<option value="">Todos los periodos</option>' + opciones.join('');
}

// La tabla recibe los registros ya ordenados y filtrados. El historial sigue accesible.
export function limitarTabla(tabla, total) {
  const filas = Array.from(tabla.tBodies[0].rows);
  const pie = document.createElement('div');
  pie.className = 'table-footer';
  const texto = document.createElement('span');
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-link';
  const mostrar = (todos) => {
    filas.forEach((fila, i) => { fila.hidden = !todos && i >= 5; });
    texto.textContent = total >= 5 && !todos ? `Mostrando los 5 más recientes de ${total}`
      : `Mostrando ${total} de ${total}`;
    boton.textContent = todos ? 'Ver los 5 más recientes' : 'Ver todos';
    boton.setAttribute('aria-expanded', String(todos));
  };
  pie.append(texto);
  if (total > 5) pie.append(boton);
  const contenedor = tabla.closest('.table-wrap');
  if (contenedor.nextElementSibling?.classList.contains('table-footer')) contenedor.nextElementSibling.remove();
  contenedor.after(pie);
  boton.onclick = () => mostrar(boton.getAttribute('aria-expanded') !== 'true');
  mostrar(false);
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3200);
}

export function errorCampo(campo, mensaje) {
  if (!(campo instanceof HTMLElement)) return;
  const grupo = campo.closest('.field-group') || campo.parentElement;
  const id = (campo.id || campo.form.id + '-' + campo.name) + '-error';
  let aviso = document.getElementById(id);
  if (!mensaje) {
    aviso?.remove();
    campo.removeAttribute('aria-invalid');
    campo.removeAttribute('aria-describedby');
    return;
  }
  if (!aviso) {
    aviso = document.createElement('span');
    aviso.id = id;
    aviso.className = 'field-error';
    grupo.append(aviso);
  }
  aviso.textContent = mensaje;
  campo.setAttribute('aria-invalid', 'true');
  campo.setAttribute('aria-describedby', id);
}

export function prepararCampos(form) {
  for (const campo of form.querySelectorAll('input.input, select.select, textarea.textarea')) {
    const etiqueta = campo.closest('.field-group')?.querySelector('label');
    if (!etiqueta) continue;
    campo.id ||= form.id + '-' + campo.name;
    etiqueta.htmlFor = campo.id;
    campo.addEventListener('invalid', () => {
      const validez = campo.validity;
      let mensaje = campo.validationMessage;
      if (validez.valueMissing) mensaje = 'Completa el campo «' + etiqueta.textContent + '».';
      else if (validez.rangeUnderflow) mensaje = 'El valor mínimo es ' + campo.min + '.';
      else if (validez.rangeOverflow) mensaje = 'El valor máximo es ' + (campo.type === 'date' ? formatDateES(campo.max) : campo.max) + '.';
      else if (validez.stepMismatch) mensaje = 'Ingresa un valor en incrementos de ' + (campo.step || '1') + '.';
      else if (validez.patternMismatch && campo.title) mensaje = campo.title;
      else if (validez.badInput) mensaje = 'Revisa el valor de «' + etiqueta.textContent + '».';
      errorCampo(campo, mensaje);
    });
    campo.addEventListener('input', () => {
      errorCampo(campo, '');
      form.querySelector('p.field-error')?.classList.add('hidden');
    });
  }
}

export function mostrarErrorFormulario(form, err, campo) {
  const campos = Object.entries(err.errors || {});
  for (const [nombre, mensajes] of campos) {
    errorCampo(form.elements.namedItem(nombre.split('.').pop()), mensajes.join(' '));
  }
  const declarado = err.message.match(/campo '([^']+)'/)?.[1];
  const control = form.elements.namedItem(err.campo || campo || declarado);
  if (control) errorCampo(control, err.message);
  const resumen = form.querySelector('p.field-error');
  if (resumen) {
    resumen.textContent = err.message;
    resumen.classList.remove('hidden');
  } else {
    showToast(err.message, 'error');
  }
  form.querySelector('[aria-invalid="true"]')?.focus();
}

export function openModal({ title, bodyHtml, onMount }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">${escapeHtml(title)}</h2>
          <button type="button" class="modal-close" id="modal-close-btn" aria-label="Cerrar">×</button>
        </div>
        <div id="modal-body">${bodyHtml}</div>
      </div>
    </div>
  `;
  const close = () => { root.innerHTML = ''; };
  document.getElementById('modal-close-btn').addEventListener('click', close);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') close();
  });
  root.querySelector('[data-cancelar]')?.addEventListener('click', close);
  const form = root.querySelector('form');
  if (form) prepararCampos(form);
  if (onMount) onMount(close);
  return close;
}

export function esBus(u) {
  return u?.tipo?.trim().toLowerCase().startsWith('bus') ?? false;
}

// Rendimiento de UNA unidad en un periodo: km consumidos ÷ galones.
// null si falta el vale anterior al periodo (algún km_consumidos es null) o no hay galones.
export function rendimientoPeriodo(vales) {
  const validos = vales.filter(vale => vale.km_consumidos != null && Number(vale.galones) > 0);
  const galones = validos.reduce((total, vale) => total + Number(vale.galones), 0);
  if (galones <= 0) return null;
  return validos.reduce((total, vale) => total + Number(vale.km_consumidos), 0) / galones;
}

// Rendimiento de la FLOTA en un periodo: se calcula por unidad y se omiten las que no
// tienen dato (p. ej. su primer vale cae en el periodo). Resultado ponderado:
// km de las unidades válidas ÷ sus galones (no se promedian rendimientos).
export function rendimientoFlota(vales) {
  const porUnidad = new Map();
  for (const vale of vales) {
    if (!porUnidad.has(vale.id_unidad)) porUnidad.set(vale.id_unidad, []);
    porUnidad.get(vale.id_unidad).push(vale);
  }
  let km = 0;
  let galones = 0;
  for (const valesUnidad of porUnidad.values()) {
    const validos = valesUnidad.filter(vale => vale.km_consumidos != null && Number(vale.galones) > 0);
    if (validos.length === 0) continue;
    km += validos.reduce((total, vale) => total + Number(vale.km_consumidos), 0);
    galones += validos.reduce((total, vale) => total + Number(vale.galones), 0);
  }
  return galones > 0 ? km / galones : null;
}
