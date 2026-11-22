import { CONFIG } from './config.js?v=6';
import { showToast } from './utils.js?v=8';

let apiOnline = false;

export function isApiOnline() {
  return apiOnline;
}

function setApiStatus(online) {
  apiOnline = online;
  const dot = document.getElementById('api-status-dot');
  if (dot) {
    dot.classList.toggle('online', online);
    dot.classList.toggle('local', !online);
    dot.title = online
      ? 'Conectado a API C# (SQL Server BD_TRANSPORTE)'
      : 'Sin conexión a la API';
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      signal: controller.signal,
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = Object.values(body.errors || {}).flat().join(' ');
      const err = new Error([body.message, detail].filter(Boolean).join(" ") || body.title || `HTTP ${res.status} (${path})`);
      err.errors = body.errors;
      err.status = res.status;
      err.codigo = body.codigo ?? null;
      throw err;
    }
    const cierres = res.headers.get('X-Cierres-Recalculados');
    if (cierres) showToast('Cierres recalculados: ' + cierres, 'success');
    const body = await res.text();
    return body ? JSON.parse(body) : null;
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof TypeError) {
      setApiStatus(false);
      err = new Error('No se pudo conectar con la API. Vuelve a intentarlo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  async checkHealth() {
    const res = await request('/dashboard/health');
    setApiStatus(res?.database === 'connected');
    if (!apiOnline) throw new Error('La API no tiene conexión con la base de datos.');
    return true;
  },

  // --- Auth ---
  async login(usuario, contrasenia) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nombre_usuario: usuario, contrasenia }),
    });
  },

  async logout(id_sesion) {
    await request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ id_sesion }),
    });
  },

  // --- Turnos ---
  async getTurnos() {
    return request('/turnos');
  },

  async saveTurno(payload, id = null) {
    return request(id ? `/turnos/${id}` : '/turnos', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  },

  // --- Combustible ---
  async getAbastecimientos() {
    const vales = await request('/combustible');
    if (vales.every(v => "rendimiento_sospechoso" in v)) return vales;
    // Compatibilidad con la versión publicada antes del PR #3.
    const anteriores = new Map();
    for (const vale of [...vales].sort((a, b) => a.km_actual - b.km_actual || a.id_abastecimiento - b.id_abastecimiento)) {
      const anterior = anteriores.get(vale.id_unidad);
      vale.km_consumidos = anterior == null ? null : vale.km_actual - anterior;
      vale.rendimiento = anterior != null && vale.galones > 0 ? vale.km_consumidos / vale.galones : null;
      anteriores.set(vale.id_unidad, vale.km_actual);
    }
    return vales;
  },

  async saveAbastecimiento(payload, id = null) {
    return request(id ? `/combustible/${id}` : '/combustible', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  },

  // --- Unidades ---
  async getUnidades(incluirInactivas = false) {
    return request(incluirInactivas ? '/unidades?incluir_inactivas=true' : '/unidades');
  },

  async bajaUnidad(id) {
    return request('/unidades/' + id, { method: 'DELETE' });
  },

  async saveUnidad(payload, id = null) {
    return request(id ? `/unidades/${id}` : '/unidades', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getUnidadHistorial(id) {
    return request(`/unidades/${id}/historial`);
  },

  async saveDocumento(payload, id = null) {
    return request(id ? `/unidades/documentos/${id}` : '/unidades/documentos', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(payload),
    });
  },

  async saveIncidente(payload, id = null) {
    return request(id ? `/unidades/incidentes/${id}` : '/unidades/incidentes', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  },

  // --- Mantenimiento ---
  async getProximosMantenimientos() {
    try {
      return (await request('/mantenimiento/proximos')).buses;
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  },

  async getMantenimientos() {
    return request('/mantenimiento');
  },

  async getBusesOperativos() {
    return request('/dashboard/buses-operativos');
  },

  async guardarSalida(id, fecha, corregir) {
    return request(`/mantenimiento/${id}/salida`, {
      method: corregir ? 'PUT' : 'POST', body: JSON.stringify({ fecha_salida: fecha }),
    });
  },

  async deshacerSalida(id) {
    return request(`/mantenimiento/${id}/salida`, { method: 'DELETE' });
  },

  async saveMantenimiento(payload) {
    return request('/mantenimiento', { method: 'POST', body: JSON.stringify(payload) });
  },

  // --- Conductores ---
  async getConductores() {
    return request('/conductores');
  },

  async bajaConductor(id) {
    return request('/conductores/' + id, { method: 'DELETE' });
  },

  async saveConductor(payload, id = null) {
    return request(id ? `/conductores/${id}` : '/conductores', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  },

  // --- Rutas y Áreas ---
  async getRutasYCostos() {
    return request('/rutas');
  },

  async saveRuta(payload) {
    return request('/rutas', { method: 'POST', body: JSON.stringify(payload) });
  },

  async saveArea(payload) {
    return request('/rutas/areas', { method: 'POST', body: JSON.stringify(payload) });
  },

  // --- Reportes y Conciliación ---
  async getReportePorUnidad(mes, unidad, dias) {
    const params = new URLSearchParams({ mes, dias });
    if (unidad) params.set('id_unidad', unidad);
    return request('/reportes/por-unidad?' + params);
  },

  async getDetalleConciliacion(anio, trimestre) {
    return request('/conciliacion/detalle?' + new URLSearchParams({ anio, trimestre }));
  },

  async getCierres() {
    return request('/reportes/trimestral');
  },

  async actualizarCierre(anio, trimestre) {
    return request('/reportes/actualizar-cierre', { method: 'POST', body: JSON.stringify({ anio, trimestre }) });
  },

  async cerrarTrimestre(anio, trimestre) {
    return request('/reportes/cerrar-trimestre', {
      method: 'POST',
      body: JSON.stringify({ anio, trimestre }),
    });
  },

  async getConciliacion() {
    const reportes = await request('/conciliacion');
    if (reportes.every(r => 'diferencia' in r)) return reportes;
    const vales = await request('/combustible');
    return reportes.map(r => ({
      ...r,
      galones_sistema: vales.filter(v => Number(v.fecha.slice(0, 4)) === r.anio &&
        Math.ceil(Number(v.fecha.slice(5, 7)) / 3) === r.trimestre).reduce((sum, v) => sum + v.galones, 0),
    }));
  },

  async saveReporteGrifo(payload) {
    return request('/conciliacion', { method: 'POST', body: JSON.stringify(payload) });
  },

  // --- Estimación de Viaje ---
  async getEstimaciones() {
    return request('/estimacion');
  },

  async saveEstimacion(payload) {
    return request('/estimacion', { method: 'POST', body: JSON.stringify(payload) });
  },
};
