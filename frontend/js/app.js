import { api } from './api.js';
import { CONFIG } from './config.js';
import { formatDateES, showToast } from './utils.js';
import { initAuth, getSession } from './modules/auth.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderTurnos } from './modules/turnos.js';
import { renderCombustible } from './modules/combustible.js';
import { renderUnidades } from './modules/unidades.js';
import { renderMantenimiento } from './modules/mantenimiento.js';
import { renderConductores } from './modules/conductores.js';
import { renderRutas } from './modules/rutas.js';
import { renderReportes } from './modules/reportes.js';
import { renderConciliacion } from './modules/conciliacion.js';
import { renderEstimacion } from './modules/estimacion.js';

const ROUTES = {
  dashboard: { title: 'Inicio', subtitle: () => `Datos al ${formatDateES(CONFIG.REFERENCE_DATE)}`, cta: null, render: renderDashboard },
  turnos: { title: 'Bitácora de turnos', subtitle: '', cta: '+ Nuevo turno', render: renderTurnos },
  combustible: { title: 'Combustible', subtitle: '', cta: '+ Nuevo vale', render: renderCombustible },
  unidades: { title: 'Unidades', subtitle: '', cta: '+ Nueva unidad', render: renderUnidades },
  mantenimiento: { title: 'Mantenimiento', subtitle: '', cta: '+ Nuevo mantenimiento', render: renderMantenimiento },
  conductores: { title: 'Conductores', subtitle: '', cta: '+ Nuevo conductor', render: renderConductores },
  rutas: { title: 'Rutas', subtitle: '', cta: '+ Nueva ruta', render: renderRutas },
  reportes: { title: 'Reportes', subtitle: '', cta: null, render: renderReportes },
  conciliacion: { title: 'Conciliación con el grifo', subtitle: '', cta: '+ Registrar reporte', render: renderConciliacion },
  estimacion: { title: 'Estimar costo de viaje', subtitle: '', cta: null, render: renderEstimacion },
};

let currentRoute = 'dashboard';

async function navigate(route) {
  if (!ROUTES[route]) route = 'dashboard';
  currentRoute = route;
  const cfg = ROUTES[route];

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === route);
  });

  document.getElementById('topbar-title').textContent = cfg.title;
  document.getElementById('topbar-subtitle').textContent = typeof cfg.subtitle === 'function' ? cfg.subtitle() : cfg.subtitle;
  document.getElementById('topbar-date').textContent = formatDateES(CONFIG.REFERENCE_DATE);
  const activeNav = document.querySelector(`.nav-item[data-route="${route}"] svg`);
  document.getElementById('topbar-icon').innerHTML = activeNav ? activeNav.outerHTML : '';

  const actionsEl = document.getElementById('topbar-actions');
  actionsEl.innerHTML = cfg.cta ? `<button id="primary-cta-btn" class="btn btn-primary">${cfg.cta}</button>` : '';

  const container = document.getElementById('view-container');
  const searchVal = document.getElementById('global-search-input').value || '';
  const view = container.cloneNode(false);
  container.replaceWith(view);
  let result;
  try {
    result = await cfg.render(view, route === 'dashboard' ? navigate : searchVal);
  } catch (err) {
    if (!view.isConnected) return;
    actionsEl.replaceChildren();
    view.textContent = 'No se pudo cargar la pantalla. ' + err.message;
    return;
  }
  if (!view.isConnected) return;

  if (cfg.cta && result?.onPrimaryAction) {
    document.getElementById('primary-cta-btn').addEventListener('click', result.onPrimaryAction);
  }

  document.getElementById('sidebar').classList.remove('open');
}

function showApp(session) {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('sidebar-user-name').textContent = session.nombre_completo || 'Encargado de Transporte';
  document.getElementById('sidebar-user-handle').textContent = session.nombre_usuario || 'admin';
  document.getElementById('topbar-date').textContent = formatDateES(CONFIG.REFERENCE_DATE);
  api.checkHealth().catch(err => showToast(err.message, 'error'));
  navigate('dashboard');
}

function showLogin() {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('actualizar-vista', () => navigate(currentRoute));
  initAuth(showApp, showLogin);

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('global-search-input').addEventListener('input', () => {
    if (currentRoute !== 'dashboard') navigate(currentRoute);
  });

  document.getElementById('notif-btn').addEventListener('click', () => navigate('dashboard'));

  const session = getSession();
  if (session) showApp(session);
  else showLogin();
});
