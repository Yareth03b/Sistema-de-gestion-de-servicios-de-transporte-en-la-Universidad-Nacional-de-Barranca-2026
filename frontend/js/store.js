const STORAGE_KEY = 'unab_transporte_db_v1';

const INITIAL_DATA = {
  usuarios: [
    { id_usuario: 1, id_rol: 1, nombres: 'Encargado', apellidos: 'de Transporte', nombre_usuario: 'admin', contrasenia: 'admin123', activo: true, rol: 'Administrador' },
    { id_usuario: 2, id_rol: 2, nombres: 'Encargado', apellidos: 'de Transporte', nombre_usuario: 'admin.transporte', contrasenia: 'unab2026', activo: true, rol: 'Encargado de Transporte' },
  ],
  unidades: [
    { id_unidad: 1, placa: 'ABC-001', tipo: 'Bus', marca: 'Mercedes-Benz', modelo: 'OF-1721', codigo_patrimonial: 'PAT-UNAB-001', capacidad: 45, estado: 'Operativo', activo: true, km_actual: 186026 },
    { id_unidad: 2, placa: 'ABC-002', tipo: 'Bus', marca: 'Hyundai', modelo: 'Universe', codigo_patrimonial: 'PAT-UNAB-002', capacidad: 42, estado: 'Operativo', activo: true, km_actual: 98850 },
    { id_unidad: 3, placa: 'ABC-003', tipo: 'Bus', marca: 'Volvo', modelo: 'B270F', codigo_patrimonial: 'PAT-UNAB-003', capacidad: 45, estado: 'Operativo', activo: true, km_actual: 74210 },
    { id_unidad: 4, placa: 'ABC-004', tipo: 'Bus', marca: 'Yutong', modelo: 'ZK6107HA', codigo_patrimonial: 'PAT-UNAB-004', capacidad: 40, estado: 'Operativo', activo: true, km_actual: 51200 },
    { id_unidad: 5, placa: 'DEF-105', tipo: 'Camioneta', marca: 'Toyota', modelo: 'Hilux 4x4', codigo_patrimonial: 'PAT-UNAB-005', capacidad: 5, estado: 'Operativo', activo: true, km_actual: 42150 },
    { id_unidad: 6, placa: 'GHI-208', tipo: 'Minivan', marca: 'Hyundai', modelo: 'H-1', codigo_patrimonial: 'PAT-UNAB-006', capacidad: 12, estado: 'En mantenimiento', activo: true, km_actual: 63400 },
  ],
  conductores: [
    { id_conductor: 1, id_unidad: 1, dni: '45123456', nombres: 'Juan', apellidos: 'Pérez', brevete: 'Q45123456', activo: true },
    { id_conductor: 2, id_unidad: 2, dni: '46234567', nombres: 'Carlos', apellidos: 'Mendoza', brevete: 'Q46234567', activo: true },
    { id_conductor: 3, id_unidad: 3, dni: '47345678', nombres: 'Jorge', apellidos: 'Castillo', brevete: 'Q47345678', activo: true },
    { id_conductor: 4, id_unidad: 4, dni: '48456789', nombres: 'Raúl', apellidos: 'Flores', brevete: 'Q48456789', activo: true },
    { id_conductor: 5, id_unidad: 2, dni: '49567890', nombres: 'Luis', apellidos: 'Ramos', brevete: 'Q49567890', activo: true },
    { id_conductor: 6, id_unidad: 4, dni: '41678901', nombres: 'Miguel', apellidos: 'Rojas', brevete: 'Q41678901', activo: true },
    { id_conductor: 7, id_unidad: 3, dni: '42789012', nombres: 'Marco', apellidos: 'Salas', brevete: 'Q42789012', activo: true },
  ],
  areas: [
    { id_area: 1, nombre: 'Servicios Generales' },
    { id_area: 2, nombre: 'Facultad de Ingeniería' },
    { id_area: 3, nombre: 'Facultad de Ciencias de la Salud' },
    { id_area: 4, nombre: 'Facultad de Educación' },
    { id_area: 5, nombre: 'Rectorado' },
    { id_area: 6, nombre: 'Bienestar Universitario' },
  ],
  rutas: [
    { id_ruta: 1, punto_salida: 'La Florida', punto_llegada: 'Paramonga', km_referencia: 15 },
    { id_ruta: 2, punto_salida: 'Paramonga', punto_llegada: 'La Florida', km_referencia: 15 },
    { id_ruta: 3, punto_salida: 'La Florida', punto_llegada: 'Supe Pueblo', km_referencia: 19 },
    { id_ruta: 4, punto_salida: 'Supe Pueblo', punto_llegada: 'La Florida', km_referencia: 19 },
    { id_ruta: 5, punto_salida: 'La Florida', punto_llegada: 'Barranca (Los Próceres)', km_referencia: 6 },
    { id_ruta: 6, punto_salida: 'Barranca (Los Próceres)', punto_llegada: 'La Florida', km_referencia: 6 },
    { id_ruta: 7, punto_salida: 'La Florida', punto_llegada: 'Campus Buena Vista', km_referencia: 8 },
    { id_ruta: 8, punto_salida: 'La Florida', punto_llegada: 'Sede Supe Puerto', km_referencia: 16 },
  ],
  turnos: [
    { id_turno: 1, id_unidad: 2, id_conductor: 2, id_ruta: 3, ruta_texto: 'La Florida ↔ Supe Pueblo', fecha: '2026-11-12', hora_salida: '14:00', hora_llegada: '22:00', km_inicial: 98820, km_final: 98850, observaciones: 'Turno tarde sin novedades' },
    { id_turno: 2, id_unidad: 3, id_conductor: 3, id_ruta: 1, ruta_texto: 'La Florida ↔ Paramonga - Barranca', fecha: '2026-11-12', hora_salida: '14:00', hora_llegada: '22:00', km_inicial: 74112, km_final: 74210, observaciones: 'Ruta Paramonga - Barranca' },
    { id_turno: 3, id_unidad: 4, id_conductor: 4, id_ruta: 3, ruta_texto: 'La Florida ↔ Supe Pueblo', fecha: '2026-11-12', hora_salida: '14:00', hora_llegada: '22:00', km_inicial: 51116, km_final: 51200, observaciones: 'Traslado estudiantes' },
    { id_turno: 4, id_unidad: 1, id_conductor: 1, id_ruta: 8, ruta_texto: 'La Florida ↔ Sede Supe Puerto', fecha: '2026-11-12', hora_salida: '06:00', hora_llegada: '14:00', km_inicial: 185986, km_final: 186026, observaciones: 'Turno mañana Sede Supe Puerto' },
    { id_turno: 5, id_unidad: 2, id_conductor: 5, id_ruta: 7, ruta_texto: 'La Florida ↔ Paramonga - Buena Vista', fecha: '2026-11-12', hora_salida: '06:00', hora_llegada: '14:00', km_inicial: 98790, km_final: 98820, observaciones: 'Ruta Paramonga - Buena Vista' },
  ],
  abastecimientos: [
    { id_abastecimiento: 1, id_unidad: 1, id_conductor: 1, id_area: 1, nro_vale: '001-0456', fecha: '2026-11-12', km_actual: 186026, galones: 56.00, km_consumidos: 510, tipo_combustible: 'Diésel B5', observaciones: 'Tanque lleno' },
    { id_abastecimiento: 2, id_unidad: 2, id_conductor: 2, id_area: 3, nro_vale: '001-0455', fecha: '2026-11-12', km_actual: 98850, galones: 50.00, km_consumidos: 510, tipo_combustible: 'Diésel B5', observaciones: 'Servicio académico' },
    { id_abastecimiento: 3, id_unidad: 4, id_conductor: 6, id_area: 4, nro_vale: '001-0446', fecha: '2026-11-12', km_actual: 51200, galones: 56.00, km_consumidos: 552, tipo_combustible: 'Diésel B5', observaciones: 'Prácticas externas' },
    { id_abastecimiento: 4, id_unidad: 3, id_conductor: 3, id_area: 2, nro_vale: '001-0443', fecha: '2026-11-12', km_actual: 74210, galones: 35.00, km_consumidos: 335, tipo_combustible: 'Diésel B5', observaciones: 'Viaje de campo' },
    { id_abastecimiento: 5, id_unidad: 3, id_conductor: 7, id_area: 2, nro_vale: '001-0442', fecha: '2026-11-10', km_actual: 73875, galones: 32.00, km_consumidos: 307, tipo_combustible: 'Diésel B5', observaciones: 'Viaje de campo' },
    { id_abastecimiento: 6, id_unidad: 5, id_conductor: 1, id_area: 5, nro_vale: '001-0440', fecha: '2026-11-08', km_actual: 42150, galones: 10.00, km_consumidos: 140, tipo_combustible: 'Gasohol 95', observaciones: 'Comisión Rectorado' },
    { id_abastecimiento: 7, id_unidad: 6, id_conductor: 5, id_area: 6, nro_vale: '001-0438', fecha: '2026-11-05', km_actual: 63400, galones: 3.00, km_consumidos: 38, tipo_combustible: 'Gasohol 90', observaciones: 'Traslado médico' },
  ],
  mantenimientos: [
    { id_mantenimiento: 1, id_unidad: 1, fecha: '2026-08-15', km: 180796, tipo: 'Preventivo', detalle: 'Cambio de aceite, filtros de aire y combustible, revisión de frenos' },
    { id_mantenimiento: 2, id_unidad: 2, fecha: '2026-09-10', km: 94170, tipo: 'Preventivo', detalle: 'Mantenimiento 5000 km completo' },
    { id_mantenimiento: 3, id_unidad: 3, fecha: '2026-10-05', km: 71210, tipo: 'Preventivo', detalle: 'Alineamiento, balanceo y cambio de aceite' },
    { id_mantenimiento: 4, id_unidad: 4, fecha: '2026-10-20', km: 48700, tipo: 'Preventivo', detalle: 'Revisión sistema eléctrico y suspensión' },
    { id_mantenimiento: 5, id_unidad: 6, fecha: '2026-11-10', km: 63400, tipo: 'Correctivo', detalle: 'Reparación de alternador y sistema de carga' },
  ],
  documentos: [
    { id_documento: 1, id_unidad: 1, tipo: 'SOAT', numero: 'SOAT-2025-88412', fecha_vencimiento: '2026-11-24' },
    { id_documento: 2, id_unidad: 1, tipo: 'Revisión Técnica', numero: 'CITV-2026-11024', fecha_vencimiento: '2027-03-15' },
    { id_documento: 3, id_unidad: 2, tipo: 'SOAT', numero: 'SOAT-2026-55210', fecha_vencimiento: '2027-05-20' },
    { id_documento: 4, id_unidad: 2, tipo: 'Revisión Técnica', numero: 'CITV-2025-99201', fecha_vencimiento: '2026-11-09' },
    { id_documento: 5, id_unidad: 3, tipo: 'SOAT', numero: 'SOAT-2026-77120', fecha_vencimiento: '2027-06-10' },
    { id_documento: 6, id_unidad: 4, tipo: 'SOAT', numero: 'SOAT-2026-66301', fecha_vencimiento: '2027-04-02' },
  ],
  incidentes: [
    { id_incidente: 1, id_unidad: 1, fecha: '2026-11-03T16:30', descripcion: 'Falla menor en sensor de puerta posterior durante ruta a Supe Puerto.' },
    { id_incidente: 2, id_unidad: 2, fecha: '2026-10-28T08:15', descripcion: 'Pinchazo en neumático trasero derecho en Av. Los Próceres.' },
  ],
  reportesGrifo: [
    { id_reporte: 1, anio: 2026, trimestre: 3, galones_total: 3392.57, observaciones: 'Factura consolidada Grifo Primax Barranca - Trimestre III', galones_sistema: 3379.00 },
    { id_reporte: 2, anio: 2026, trimestre: 4, galones_total: 1526.00, observaciones: 'Corte parcial al 12/11/2026', galones_sistema: 1526.00 },
  ],
  cierres: [
    {
      id_cierre: 1, anio: 2026, trimestre: 3, fecha_cierre: '2026-09-30',
      unidades: [
        { id_unidad: 1, placa: 'ABC-001', km_recorridos: 8450, galones: 918.48, rendimiento: 9.20, km_acumulado: 181919 },
        { id_unidad: 2, placa: 'ABC-002', km_recorridos: 7920, galones: 784.16, rendimiento: 10.10, km_acumulado: 94743 },
        { id_unidad: 3, placa: 'ABC-003', km_recorridos: 8110, galones: 844.79, rendimiento: 9.60, km_acumulado: 70103 },
        { id_unidad: 4, placa: 'ABC-004', km_recorridos: 7560, galones: 771.43, rendimiento: 9.80, km_acumulado: 47093 },
      ],
    },
  ],
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
