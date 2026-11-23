import { api } from './api.js?v=10';
import { CONFIG } from './config.js?v=10';
import { formatDateES, showToast } from './utils.js?v=10';
import { initAuth, clearSession, getSession } from './modules/auth.js?v=10';
import { renderDashboard } from './modules/dashboard.js?v=10';
import { renderTurnos } from './modules/turnos.js?v=10';
import { renderCombustible } from './modules/combustible.js?v=10';
import { renderUnidades } from './modules/unidades.js?v=10';
import { renderMantenimiento } from './modules/mantenimiento.js?v=10';
import { renderConductores } from './modules/conductores.js?v=10';
import { renderRutas } from './modules/rutas.js?v=10';
import { renderReportes } from './modules/reportes.js?v=10';
import { renderConciliacion } from './modules/conciliacion.js?v=10';
import { renderEstimacion } from './modules/estimacion.js?v=10';

const ROUTES = {
  dashboard: { title: 'Inicio', subtitle: () => `Datos al ${formatDateES(CONFIG.REFERENCE_DATE)}`, cta: null, render: renderDashboard },
  turnos: { title: 'Bitácora de turnos', subtitle: '', cta: '+ Nuevo turno', render: renderTurnos },
  combustible: { title: 'Combustible', subtitle: '', cta: '+ Nuevo vale', render: renderCombustible },
  unidades: { title: 'Unidades', subtitle: '', cta: '+ Nueva unidad', render: renderUnidades },
  mantenimiento: { title: 'Mantenimiento', subtitle: '', cta: 'Ingreso al taller', render: renderMantenimiento },
  conductores: { title: 'Conductores', subtitle: '', cta: '+ Nuevo conductor', render: renderConductores },
  rutas: { title: 'Rutas', subtitle: '', cta: '+ Nueva ruta', render: renderRutas },
  reportes: { title: 'Reportes', subtitle: '', cta: null, render: renderReportes },
  conciliacion: { title: 'Conciliación con el grifo', subtitle: '', cta: '+ Registrar reporte', render: renderConciliacion },
  estimacion: { title: 'Estimar costo de viaje', subtitle: '', cta: null, render: renderEstimacion },
};

let currentRoute = 'dashboard';
let currentParam = null;

function parseHash(hash = window.location.hash) {
  const clean = hash.replace(/^#\/?/, '').trim();
  const [baseRoute, ...rest] = clean.split('/');
  return {
    raw: clean,
    baseRoute: baseRoute || 'dashboard',
    param: rest.join('/') || null,
  };
}

async function renderView(route, param = null) {
  if (!ROUTES[route]) {
    route = 'dashboard';
    param = null;
  }
  currentRoute = route;
  currentParam = param;
  const cfg = ROUTES[route];

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === route);
  });

  document.getElementById('topbar-title').textContent = cfg.title;
  document.getElementById('topbar-subtitle').textContent = param
    ? 'Ficha de unidad'
    : (typeof cfg.subtitle === 'function' ? cfg.subtitle() : cfg.subtitle);
  document.getElementById('topbar-date').textContent = formatDateES(CONFIG.REFERENCE_DATE);
  const activeNav = document.querySelector(`.nav-item[data-route="${route}"] svg`);
  document.getElementById('topbar-icon').innerHTML = activeNav ? activeNav.outerHTML : '';

  const actionsEl = document.getElementById('topbar-actions');
  actionsEl.innerHTML = (cfg.cta && !param) ? `<button id="primary-cta-btn" class="btn btn-primary">${cfg.cta}</button>` : '';

  const container = document.getElementById('view-container');
  const searchVal = document.getElementById('global-search-input').value || '';
  const view = container.cloneNode(false);
  container.replaceWith(view);
  let result;
  try {
    result = await cfg.render(view, route === 'dashboard' ? navigate : searchVal, param);
  } catch (err) {
    if (!view.isConnected) return;
    actionsEl.replaceChildren();
    view.textContent = 'No se pudo cargar la pantalla. ' + err.message;
    return;
  }
  if (!view.isConnected) return;

  if (cfg.cta && !param && result?.onPrimaryAction) {
    document.getElementById('primary-cta-btn')?.addEventListener('click', result.onPrimaryAction);
  }

  document.getElementById('sidebar').classList.remove('open');
}

function navigate(path) {
  const clean = String(path || 'dashboard').replace(/^#\/?/, '').trim();
  const targetHash = '#/' + clean;
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  } else {
    const { baseRoute, param } = parseHash(targetHash);
    renderView(baseRoute, param);
  }
}

function handleRouteFromHash() {
  if (!getSession()) {
    showLogin();
    return;
  }
  const { baseRoute, param } = parseHash();
  if (!ROUTES[baseRoute]) {
    history.replaceState(null, '', '#/dashboard');
    renderView('dashboard', null);
    return;
  }
  const normalized = '#/' + (param ? `${baseRoute}/${param}` : baseRoute);
  if (window.location.hash !== normalized) {
    history.replaceState(null, '', normalized);
  }
  renderView(baseRoute, param);
}

function showApp(session) {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('sidebar-user-name').textContent = session.nombre_completo || 'Encargado de Transporte';
  document.getElementById('sidebar-user-handle').textContent = session.nombre_usuario || 'admin';
  document.getElementById('topbar-date').textContent = formatDateES(CONFIG.REFERENCE_DATE);
  api.checkHealth().catch(err => showToast(err.message, 'error'));
  handleRouteFromHash();
}

function showLogin() {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('view-container')?.replaceChildren();
}

function handleLogout() {
  clearSession();
  showLogin();
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', () => {
    if (!getSession()) {
      showLogin();
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }
    handleRouteFromHash();
  });

  document.addEventListener('actualizar-vista', () => {
    renderView(currentRoute, currentParam);
  });

  initAuth(showApp, handleLogout);

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('global-search-input').addEventListener('input', () => {
    if (currentRoute !== 'dashboard') renderView(currentRoute, currentParam);
  });

  document.getElementById('notif-btn').addEventListener('click', () => navigate('dashboard'));

  const session = getSession();
  if (session) {
    showApp(session);
  } else {
    showLogin();
  }
});
