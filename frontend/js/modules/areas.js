import { api } from '../api.js?v=10';
import { escapeHtml, openModal, showToast } from '../utils.js?v=10';

export function campoArea(obligatorio = false) {
  return `<div class="field-group campo-area">
    <label class="field-label" for="area-elegir">Área solicitante</label>
    <select name="id_area" hidden ${obligatorio ? 'required' : ''}></select>
    <button class="select" type="button" id="area-elegir" aria-expanded="false" aria-controls="area-menu" aria-describedby="area-error"></button>
    <div id="area-menu" class="area-menu" hidden></div>
    <span class="field-error" id="area-error" role="alert"></span>
  </div>`;
}

export const altaArea = `<section class="area-alta" hidden>
  <label class="field-label" for="area-nombre">Nombre del área</label>
  <input id="area-nombre" class="input" maxlength="100">
  <span class="field-error" role="alert"></span>
  <div class="area-botones"><button type="button" class="btn btn-primary" data-agregar>Agregar</button>
    <button type="button" class="btn btn-ghost" data-descartar>Cancelar</button></div></section>`;

function validarNombre(nombre) {
  if (!nombre) throw new Error('El nombre del área es obligatorio.');
  if (nombre.length > 100) throw new Error('El nombre del área admite como máximo 100 caracteres.');
}

export function prepararArea(form, areas, idActual, alActualizar) {
  const select = form.elements.id_area;
  const campo = form.querySelector('.campo-area');
  const boton = campo.querySelector('button');
  const menu = campo.querySelector('.area-menu');
  const aviso = campo.querySelector('#area-error');
  const alta = form.querySelector('.area-alta');
  const nombre = alta.querySelector('input');
  const agregar = alta.querySelector('[data-agregar]');
  const textoVacio = select.required ? 'Selecciona un área' : 'Sin área específica';
  const pintar = (id = select.value) => {
    select.replaceChildren(new Option(textoVacio, ''), ...areas.map(a => new Option(a.nombre, a.id_area)));
    select.value = areas.some(a => String(a.id_area) === String(id)) ? String(id) : '';
    boton.textContent = select.selectedOptions[0].textContent;
    menu.innerHTML = `${[...select.options].filter(o => o.value || !select.required).map(o =>
      `<button type="button" data-id="${o.value}" aria-pressed="${select.value === o.value}">${escapeHtml(o.textContent)}</button>`).join('')}
      <div class="area-comandos"><button type="button" data-nueva-area>+ Nueva área…</button>
      <button type="button" data-administrar>Administrar áreas…</button></div>`;
  };
  pintar(idActual);
  let revision = 0;
  const actualizar = (lista, id = select.value) => {
    revision++;
    areas.splice(0, areas.length, ...lista);
    pintar(id);
    alActualizar();
  };
  const refrescar = async () => {
    const consulta = ++revision;
    const { areas: lista } = await api.getRutasYCostos();
    if (consulta === revision) actualizar(lista);
  };
  const cerrarMenu = () => {
    menu.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
  };
  const cerrarAlta = () => {
    alta.hidden = true;
    nombre.value = '';
    alta.querySelector('.field-error').textContent = '';
    pintar();
    boton.focus();
  };
  const elegir = id => {
    pintar(id);
    aviso.textContent = '';
    boton.removeAttribute('aria-invalid');
    select.dispatchEvent(new Event('input', { bubbles: true }));
  };
  select.oninvalid = e => {
    e.preventDefault();
    aviso.textContent = 'Selecciona un área solicitante.';
    boton.setAttribute('aria-invalid', 'true');
    boton.focus();
  };
  boton.onclick = () => {
    if (!alta.hidden) cerrarAlta();
    menu.hidden = !menu.hidden;
    boton.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) (menu.querySelector('[aria-pressed="true"]') || menu.querySelector('button')).focus();
  };
  campo.onfocusout = e => { if (!campo.contains(e.relatedTarget)) cerrarMenu(); };
  campo.closest('.modal-card').addEventListener('pointerdown', e => {
    if (!campo.contains(e.target)) cerrarMenu();
  });
  campo.onkeydown = e => {
    if (e.key === 'Escape' && !menu.hidden) {
      cerrarMenu();
      boton.focus();
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (menu.hidden) { boton.click(); return; }
    const opciones = [...menu.querySelectorAll('button')];
    const siguiente = opciones.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1);
    opciones[(siguiente + opciones.length) % opciones.length].focus();
  };
  menu.onclick = e => {
    const opcion = e.target.closest('button');
    if (!opcion) return;
    cerrarMenu();
    boton.focus();
    if (opcion.hasAttribute('data-id')) {
      elegir(opcion.dataset.id);
    } else if (opcion.hasAttribute('data-nueva-area')) {
      boton.textContent = '+ Nueva área…';
      alta.hidden = false;
      nombre.focus();
    } else {
      administrarAreas(areas, actualizar, () => refrescar().catch(err => showToast(err.message, 'error')));
    }
  };
  alta.querySelector('[data-descartar]').onclick = cerrarAlta;
  nombre.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); agregar.click(); }
    if (e.key === 'Escape' && !agregar.disabled) cerrarAlta();
  };
  form.addEventListener('submit', e => {
    if (!alta.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      nombre.focus();
    }
  }, true);
  const buscar = valor => areas.find(a => a.nombre.toLowerCase() === valor.toLowerCase());
  agregar.onclick = async () => {
    const valor = nombre.value.trim();
    const cancelar = alta.querySelector('[data-descartar]');
    const controles = [agregar, cancelar, boton, nombre];
    controles.forEach(control => control.disabled = true);
    try {
      validarNombre(valor);
      let area = buscar(valor);
      if (!area) {
        try {
          area = await api.saveArea({ nombre: valor });
          actualizar([...areas, area], area.id_area);
        } catch (err) {
          if (err.status !== 409) throw err;
          await refrescar();
          area = buscar(valor);
          if (!area) throw err;
        }
      }
      elegir(area.id_area);
      cerrarAlta();
    } catch (err) {
      alta.querySelector('.field-error').textContent = err.message;
    } finally {
      controles.forEach(control => control.disabled = false);
      (alta.hidden ? boton : nombre).focus();
    }
  };
}

function administrarAreas(areas, actualizar, onClose) {
  openModal({
    title: 'Administrar áreas', onClose,
    bodyHtml: `<p class="card-meta">Áreas disponibles para las solicitudes y los vales de combustible.</p>
      <div class="areas-lista"></div>
      <div class="modal-actions"><button type="button" class="btn btn-primary" data-cancelar>Cerrar</button></div>`,
    onMount(close, capa) {
      const lista = capa.querySelector('.areas-lista');
      const pintarFila = (fila, area, editar = false) => {
        fila.innerHTML = `<div class="area-linea">
          ${editar ? `<label class="field-group"><span class="field-label">Nombre del área</span>
            <input class="input" maxlength="100" value="${escapeHtml(area.nombre)}"></label>
            <button type="button" class="btn btn-primary" data-guardar>Guardar</button>
            <button type="button" class="btn btn-ghost" data-cancelar-edicion>Cancelar</button>`
            : `<span>${escapeHtml(area.nombre)}</span>
            <button type="button" class="btn btn-outline" data-editar>Editar</button>
            <button type="button" class="btn btn-danger" data-borrar>Borrar</button>`}
          </div><p class="area-error" role="alert"></p>`;
        const error = fila.querySelector('.area-error');
        if (editar) {
          const input = fila.querySelector('input');
          const guardar = fila.querySelector('[data-guardar]');
          input.focus();
          input.select();
          fila.querySelector('[data-cancelar-edicion]').onclick = () => pintarFila(fila, area);
          input.onkeydown = e => { if (e.key === 'Enter') guardar.click(); };
          guardar.onclick = async () => {
            const nombre = input.value.trim();
            const botones = fila.querySelectorAll('button');
            botones.forEach(b => b.disabled = true);
            try {
              validarNombre(nombre);
              const resultado = await api.updateArea(area.id_area, { nombre });
              actualizar(areas.map(a => a.id_area === area.id_area ? { ...a, ...resultado } : a));
              pintarFila(fila, resultado);
            } catch (err) {
              error.textContent = err.message;
            } finally {
              botones.forEach(b => b.disabled = false);
            }
          };
          return;
        }
        fila.querySelector('[data-editar]').onclick = () => pintarFila(fila, area, true);
        fila.querySelector('[data-borrar]').onclick = () => {
          openModal({
            title: `¿Borrar el área «${area.nombre}»?`,
            bodyHtml: `<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancelar>Cancelar</button>
              <button type="button" class="btn btn-danger" data-confirmar>Borrar área</button></div>`,
            onMount(cerrar, confirmacion) {
              const confirmar = confirmacion.querySelector('[data-confirmar]');
              confirmar.onclick = async () => {
                confirmar.disabled = true;
                try {
                  await api.deleteArea(area.id_area);
                  actualizar(areas.filter(a => a.id_area !== area.id_area));
                  fila.remove();
                  if (!areas.length) lista.textContent = 'Sin áreas registradas.';
                } catch (err) {
                  error.textContent = err.message;
                } finally {
                  cerrar();
                }
              };
            },
          });
        };
      };
      for (const area of areas) {
        const fila = document.createElement('div');
        fila.className = 'area-fila';
        lista.append(fila);
        pintarFila(fila, area);
      }
      if (!areas.length) lista.textContent = 'Sin áreas registradas.';
    },
  });
}
