import { CONFIG } from './config.js';
import { loadStore, saveStore, nextId } from './store.js';

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
      : 'Modo local (sin conexión a API C#)';
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timer);
    setApiStatus(true);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `Error HTTP ${res.status}`);
    }
    return res.status === 204 ? null : await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError' || err instanceof TypeError) {
      setApiStatus(false);
      return null; // Señal para usar almacenamiento local
    }
    throw err;
  }
}

export const api = {
  async checkHealth() {
    const res = await request('/dashboard/health');
    return res !== null;
  },

  // --- Auth ---
  async login(usuario, contrasenia) {
    const remote = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nombre_usuario: usuario, contrasenia }),
    });
    if (remote) return remote;

    const db = loadStore();
    const user = db.usuarios.find(
      (u) => u.nombre_usuario.toLowerCase() === usuario.trim().toLowerCase() && u.contrasenia === contrasenia && u.activo
    );
    if (!user) throw new Error('Usuario o contraseña incorrectos.');
    return {
      id_usuario: user.id_usuario,
      nombre_usuario: user.nombre_usuario,
      nombre_completo: `${user.nombres} ${user.apellidos}`,
      rol: user.rol,
      id_sesion: Date.now(),
    };
  },

  async logout(id_sesion) {
    await request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ id_sesion }),
    }).catch(() => null);
  },

  // --- Turnos ---
  async getTurnos() {
    const remote = await request('/turnos');
    if (remote) return remote;
    const db = loadStore();
    return db.turnos.map((t) => ({
      ...t,
      km_recorridos: t.km_final - t.km_inicial,
      placa: db.unidades.find((u) => u.id_unidad === t.id_unidad)?.placa || '-',
      conductor: (() => {
        const c = db.conductores.find((x) => x.id_conductor === t.id_conductor);
        return c ? `${c.nombres} ${c.apellidos}` : '-';
      })(),
    }));
  },

  async saveTurno(payload, id = null) {
    const remote = await request(id ? `/turnos/${id}` : '/turnos', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (remote) return remote;

    if (Number(payload.km_final) <= Number(payload.km_inicial)) {
      throw new Error('El kilometraje final debe ser mayor al kilometraje inicial.');
    }
    const db = loadStore();
    const ruta = db.rutas.find((r) => r.id_ruta === Number(payload.id_ruta));
    const rutaTexto = payload.ruta_texto || (ruta ? `${ruta.punto_salida} ↔ ${ruta.punto_llegada}` : 'Ruta asignada');
    if (id) {
      const idx = db.turnos.findIndex((t) => t.id_turno === id);
      if (idx >= 0) db.turnos[idx] = { ...db.turnos[idx], ...payload, ruta_texto: rutaTexto };
    } else {
      db.turnos.unshift({ id_turno: nextId(db.turnos, 'id_turno'), ...payload, ruta_texto: rutaTexto });
    }
    const unidad = db.unidades.find((u) => u.id_unidad === Number(payload.id_unidad));
    if (unidad && Number(payload.km_final) > (unidad.km_actual || 0)) {
      unidad.km_actual = Number(payload.km_final);
    }
    saveStore(db);
    return { ok: true };
  },

  async deleteTurno(id) {
    const remote = await request(`/turnos/${id}`, { method: 'DELETE' });
    if (remote !== null) return;
    const db = loadStore();
    db.turnos = db.turnos.filter((t) => t.id_turno !== id);
    saveStore(db);
  },

  // --- Combustible ---
  async getAbastecimientos() {
    const remote = await request('/combustible');
    if (remote) return remote;
    const db = loadStore();
    return db.abastecimientos.map((a) => {
      const u = db.unidades.find((x) => x.id_unidad === a.id_unidad);
      const c = db.conductores.find((x) => x.id_conductor === a.id_conductor);
      const area = db.areas.find((x) => x.id_area === a.id_area);
      const kmCons = a.km_consumidos || 0;
      const rend = a.galones > 0 && kmCons > 0 ? +(kmCons / a.galones).toFixed(1) : 0;
      return {
        ...a,
        placa: u?.placa || '-',
        conductor: c ? `${c.nombres} ${c.apellidos}` : '-',
        area_nombre: area?.nombre || '-',
        rendimiento: rend,
      };
    });
  },

  async saveAbastecimiento(payload, id = null) {
    const remote = await request(id ? `/combustible/${id}` : '/combustible', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (remote) return remote;

    if (Number(payload.galones) <= 0) {
      throw new Error('La cantidad de galones debe ser mayor a 0.');
    }
    const db = loadStore();
    const dup = db.abastecimientos.find(
      (a) => a.nro_vale.toLowerCase() === payload.nro_vale.trim().toLowerCase() && a.id_abastecimiento !== id
    );
    if (dup) throw new Error(`El número de vale ${payload.nro_vale} ya existe.`);

    if (id) {
      const idx = db.abastecimientos.findIndex((a) => a.id_abastecimiento === id);
      if (idx >= 0) db.abastecimientos[idx] = { ...db.abastecimientos[idx], ...payload };
    } else {
      const prev = db.abastecimientos.find((a) => a.id_unidad === Number(payload.id_unidad));
      const kmCons = prev ? Math.max(0, Number(payload.km_actual) - Number(prev.km_actual)) : 0;
      db.abastecimientos.unshift({
        id_abastecimiento: nextId(db.abastecimientos, 'id_abastecimiento'),
        km_consumidos: kmCons,
        ...payload,
      });
    }
    saveStore(db);
    return { ok: true };
  },

  // --- Unidades ---
  async getUnidades() {
    const remote = await request('/unidades');
    if (remote) return remote;
    return loadStore().unidades;
  },

  async saveUnidad(payload, id = null) {
    const remote = await request(id ? `/unidades/${id}` : '/unidades', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (remote) return remote;

    const db = loadStore();
    const dup = db.unidades.find(
      (u) => u.placa.toUpperCase() === payload.placa.trim().toUpperCase() && u.id_unidad !== id
    );
    if (dup) throw new Error(`La placa ${payload.placa} ya está registrada.`);

    if (id) {
      const idx = db.unidades.findIndex((u) => u.id_unidad === id);
      if (idx >= 0) db.unidades[idx] = { ...db.unidades[idx], ...payload };
    } else {
      db.unidades.push({ id_unidad: nextId(db.unidades, 'id_unidad'), activo: true, km_actual: 0, ...payload });
    }
    saveStore(db);
    return { ok: true };
  },

  async getUnidadHistorial(id) {
    const remote = await request(`/unidades/${id}/historial`);
    if (remote) return remote;
    const db = loadStore();
    return {
      unidad: db.unidades.find((u) => u.id_unidad === id),
      turnos: db.turnos.filter((t) => t.id_unidad === id),
      abastecimientos: db.abastecimientos.filter((a) => a.id_unidad === id),
      mantenimientos: db.mantenimientos.filter((m) => m.id_unidad === id),
      documentos: db.documentos.filter((d) => d.id_unidad === id),
      incidentes: db.incidentes.filter((i) => i.id_unidad === id),
    };
  },

  async saveDocumento(payload) {
    const remote = await request('/unidades/documentos', { method: 'POST', body: JSON.stringify(payload) });
    if (remote) return remote;
    const db = loadStore();
    db.documentos.push({ id_documento: nextId(db.documentos, 'id_documento'), ...payload });
    saveStore(db);
  },

  async saveIncidente(payload, id = null) {
    const remote = await request(id ? `/unidades/incidentes/${id}` : '/unidades/incidentes', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (remote) return remote;
    const db = loadStore();
    if (id) {
      const idx = db.incidentes.findIndex((i) => i.id_incidente === id);
      if (idx >= 0) db.incidentes[idx] = { ...db.incidentes[idx], ...payload };
    } else {
      db.incidentes.unshift({ id_incidente: nextId(db.incidentes, 'id_incidente'), ...payload });
    }
    saveStore(db);
  },

  // --- Mantenimiento ---
  async getMantenimientos() {
    const remote = await request('/mantenimiento');
    if (remote) return remote;
    const db = loadStore();
    return db.mantenimientos.map((m) => ({
      ...m,
      placa: db.unidades.find((u) => u.id_unidad === m.id_unidad)?.placa || '-',
    }));
  },

  async saveMantenimiento(payload) {
    const remote = await request('/mantenimiento', { method: 'POST', body: JSON.stringify(payload) });
    if (remote) return remote;
    const db = loadStore();
    db.mantenimientos.unshift({ id_mantenimiento: nextId(db.mantenimientos, 'id_mantenimiento'), ...payload });
    saveStore(db);
  },

  // --- Conductores ---
  async getConductores() {
    const remote = await request('/conductores');
    if (remote) return remote;
    const db = loadStore();
    return db.conductores.map((c) => ({
      ...c,
      placa: db.unidades.find((u) => u.id_unidad === c.id_unidad)?.placa || 'Sin asignar',
    }));
  },

  async saveConductor(payload, id = null) {
    const remote = await request(id ? `/conductores/${id}` : '/conductores', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (remote) return remote;

    if (!/^\d{8}$/.test(payload.dni)) {
      throw new Error('El DNI debe tener exactamente 8 dígitos numéricos.');
    }
    const db = loadStore();
    if (id) {
      const idx = db.conductores.findIndex((c) => c.id_conductor === id);
      if (idx >= 0) db.conductores[idx] = { ...db.conductores[idx], ...payload };
    } else {
      db.conductores.push({ id_conductor: nextId(db.conductores, 'id_conductor'), activo: true, ...payload });
    }
    saveStore(db);
  },

  // --- Rutas y Áreas ---
  async getRutasYCostos() {
    const remote = await request('/rutas');
    if (remote) return remote;
    const db = loadStore();
    const areasResumen = db.areas.map((a) => {
      const vales = db.abastecimientos.filter((x) => x.id_area === a.id_area);
      return {
        ...a,
        vales: vales.length,
        galones: vales.reduce((s, v) => s + Number(v.galones), 0),
      };
    });
    return { rutas: db.rutas, areas: areasResumen };
  },

  async saveRuta(payload) {
    const remote = await request('/rutas', { method: 'POST', body: JSON.stringify(payload) });
    if (remote) return remote;
    const db = loadStore();
    db.rutas.push({ id_ruta: nextId(db.rutas, 'id_ruta'), ...payload });
    saveStore(db);
  },

  async saveArea(payload) {
    const remote = await request('/rutas/areas', { method: 'POST', body: JSON.stringify(payload) });
    if (remote) return remote;
    const db = loadStore();
    db.areas.push({ id_area: nextId(db.areas, 'id_area'), ...payload });
    saveStore(db);
  },

  // --- Reportes y Conciliación ---
  async getCierres() {
    const remote = await request('/reportes/trimestral');
    if (remote) return remote;
    return loadStore().cierres;
  },

  async cerrarTrimestre(anio, trimestre) {
    const remote = await request('/reportes/cerrar-trimestre', {
      method: 'POST',
      body: JSON.stringify({ anio, trimestre }),
    });
    if (remote) return remote;
    const db = loadStore();
    if (db.cierres.some((c) => c.anio === anio && c.trimestre === trimestre)) {
      throw new Error(`El trimestre ${trimestre} de ${anio} ya fue cerrado.`);
    }
    const unidades = db.unidades.filter((u) => u.tipo === 'Bus').map((u) => {
      const kmRec = db.turnos.filter((t) => t.id_unidad === u.id_unidad).reduce((s, t) => s + (t.km_final - t.km_inicial), 0) || 1200;
      const gal = db.abastecimientos.filter((a) => a.id_unidad === u.id_unidad).reduce((s, a) => s + Number(a.galones), 0) || 125;
      return {
        id_unidad: u.id_unidad,
        placa: u.placa,
        km_recorridos: kmRec,
        galones: gal,
        rendimiento: +(kmRec / gal).toFixed(2),
        km_acumulado: u.km_actual || 0,
      };
    });
    db.cierres.unshift({
      id_cierre: nextId(db.cierres, 'id_cierre'),
      anio,
      trimestre,
      fecha_cierre: new Date().toISOString().slice(0, 10),
      unidades,
    });
    saveStore(db);
  },

  async getConciliacion() {
    const remote = await request('/conciliacion');
    if (remote) return remote;
    return loadStore().reportesGrifo;
  },

  async saveReporteGrifo(payload) {
    const remote = await request('/conciliacion', { method: 'POST', body: JSON.stringify(payload) });
    if (remote) return remote;
    const db = loadStore();
    const existing = db.reportesGrifo.find((r) => r.anio === payload.anio && r.trimestre === payload.trimestre);
    const galSistema = db.abastecimientos.reduce((s, a) => s + Number(a.galones), 0);
    if (existing) {
      existing.galones_total = payload.galones_total;
      existing.observaciones = payload.observaciones;
    } else {
      db.reportesGrifo.unshift({
        id_reporte: nextId(db.reportesGrifo, 'id_reporte'),
        galones_sistema: galSistema,
        ...payload,
      });
    }
    saveStore(db);
  },

  // --- Estimación de Viaje ---
  async getEstimaciones() {
    const remote = await request('/estimacion');
    if (remote) return remote;
    return loadStore().estimaciones;
  },

  async saveEstimacion(payload) {
    const remote = await request('/estimacion', { method: 'POST', body: JSON.stringify(payload) });
    if (remote) return remote;
    const db = loadStore();
    const record = { id_estimacion: nextId(db.estimaciones, 'id_estimacion'), ...payload };
    db.estimaciones.unshift(record);
    saveStore(db);
    return record;
  },
};
