export const STORAGE_KEY = 'unab_transporte_db_v2';

const INITIAL_DATA = {
  usuarios: [
    {
      id_usuario: 1,
      id_rol: 1,
      nombres: 'Encargado',
      apellidos: 'de Transporte',
      nombre_usuario: 'admin',
      contrasenia: 'admin123',
      activo: true,
      rol: 'Administrador',
    },
  ],
  unidades: [],
  conductores: [],
  areas: [],
  rutas: [],
  turnos: [],
  abastecimientos: [],
  mantenimientos: [],
  documentos: [],
  incidentes: [],
  reportesGrifo: [],
  cierres: [],
  estimaciones: [],
};

export function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DATA));
      return structuredClone(INITIAL_DATA);
    }
    return JSON.parse(raw);
  } catch {
    return structuredClone(INITIAL_DATA);
  }
}

export function saveStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function nextId(list, key) {
  if (!list.length) return 1;
  return Math.max(...list.map((x) => Number(x[key]) || 0)) + 1;
}
