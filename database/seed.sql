USE BD_TRANSPORTE;
GO

-- Roles
INSERT INTO Rol (nombre_rol) VALUES
('Administrador'),
('Encargado de Transporte'),
('Operador');
GO

-- Usuarios (contrasenia demo: SHA-256 o texto de prueba; en el API se soporta hash SHA-256 y verificacion)
INSERT INTO Usuario (id_rol, nombres, apellidos, nombre_usuario, contrasenia, activo) VALUES
(1, 'Encargado', 'de Transporte', 'admin', 'admin123', 1),
(2, 'Encargado', 'de Transporte', 'admin.transporte', 'unab2026', 1);
GO

-- Unidades de Transporte
INSERT INTO UnidadTransporte (id_usuario, placa, tipo, marca, modelo, codigo_patrimonial, capacidad, estado, activo) VALUES
(2, 'ABC-001', 'Bus', 'Mercedes-Benz', 'OF-1721', 'PAT-UNAB-001', 45, 'Operativo', 1),
(2, 'ABC-002', 'Bus', 'Hyundai', 'Universe', 'PAT-UNAB-002', 42, 'Operativo', 1),
(2, 'ABC-003', 'Bus', 'Volvo', 'B270F', 'PAT-UNAB-003', 45, 'Operativo', 1),
(2, 'ABC-004', 'Bus', 'Yutong', 'ZK6107HA', 'PAT-UNAB-004', 40, 'Operativo', 1),
(2, 'DEF-105', 'Camioneta', 'Toyota', 'Hilux 4x4', 'PAT-UNAB-005', 5, 'Operativo', 1),
(2, 'GHI-208', 'Minivan', 'Hyundai', 'H-1', 'PAT-UNAB-006', 12, 'En mantenimiento', 1);
GO

-- Conductores
INSERT INTO Conductor (id_unidad, dni, nombres, apellidos, brevete, activo) VALUES
(1, '45123456', 'Juan', 'Pérez', 'Q45123456', 1),
(2, '46234567', 'Carlos', 'Mendoza', 'Q46234567', 1),
(3, '47345678', 'Jorge', 'Castillo', 'Q47345678', 1),
(4, '48456789', 'Raúl', 'Flores', 'Q48456789', 1),
(2, '49567890', 'Luis', 'Ramos', 'Q49567890', 1),
(4, '41678901', 'Miguel', 'Rojas', 'Q41678901', 1),
(3, '42789012', 'Marco', 'Salas', 'Q42789012', 1);
GO

-- Areas Solicitantes
INSERT INTO AreaSolicitante (nombre) VALUES
('Servicios Generales'),
('Facultad de Ingeniería'),
('Facultad de Ciencias de la Salud'),
('Facultad de Educación'),
('Rectorado'),
('Bienestar Universitario');
GO

-- Rutas de referencia
INSERT INTO Ruta (punto_salida, punto_llegada, km_referencia) VALUES
('La Florida', 'Paramonga', 15),
('Paramonga', 'La Florida', 15),
('La Florida', 'Supe Pueblo', 19),
('Supe Pueblo', 'La Florida', 19),
('La Florida', 'Barranca (Los Próceres)', 6),
('Barranca (Los Próceres)', 'La Florida', 6),
('La Florida', 'Campus Buena Vista', 8),
('La Florida', 'Sede Supe Puerto', 16);
GO

-- Bitacora de Turnos
INSERT INTO BitacoraTurno (id_unidad, id_conductor, fecha, hora_salida, hora_llegada, km_inicial, km_final, observaciones) VALUES
(2, 2, '2026-11-12', '14:00:00', '22:00:00', 98820, 98850, 'Turno tarde sin novedades'),
(3, 3, '2026-11-12', '14:00:00', '22:00:00', 74112, 74210, 'Ruta Paramonga - Barranca'),
(4, 4, '2026-11-12', '14:00:00', '22:00:00', 51116, 51200, 'Traslado estudiantes'),
(1, 1, '2026-11-12', '06:00:00', '14:00:00', 185986, 186026, 'Turno mañana Sede Supe Puerto'),
(2, 5, '2026-11-12', '06:00:00', '14:00:00', 98790, 98820, 'Ruta Paramonga - Buena Vista');
GO

INSERT INTO TurnoRuta (id_turno, id_ruta) VALUES
(1, 3),
(2, 1),
(3, 3),
(4, 8),
(5, 7);
GO

-- Abastecimiento de Combustible
INSERT INTO Abastecimiento (id_unidad, id_conductor, id_area, nro_vale, fecha, km_actual, galones, tipo_combustible, observaciones) VALUES
(1, 1, 1, '001-0456', '2026-11-12', 186026, 56.00, 'Diésel B5', 'Tanque lleno'),
(2, 2, 3, '001-0455', '2026-11-12', 98850, 50.00, 'Diésel B5', 'Servicio académico'),
(4, 6, 4, '001-0446', '2026-11-12', 51200, 56.00, 'Diésel B5', 'Prácticas externas'),
(3, 3, 2, '001-0443', '2026-11-12', 74210, 35.00, 'Diésel B5', 'Viaje de campo'),
(3, 7, 2, '001-0442', '2026-11-10', 73875, 32.00, 'Diésel B5', 'Viaje de campo'),
(5, 1, 5, '001-0440', '2026-11-08', 42150, 10.00, 'Gasohol 95', 'Comisión Rectorado'),
(6, 5, 6, '001-0438', '2026-11-05', 63400, 3.00, 'Gasohol 90', 'Traslado médico');
GO

-- Mantenimientos
INSERT INTO Mantenimiento (id_unidad, fecha, km, tipo, detalle, foto) VALUES
(1, '2026-08-15', 180796, 'Preventivo', 'Cambio de aceite, filtros de aire y combustible, revisión de frenos', NULL),
(2, '2026-09-10', 94170, 'Preventivo', 'Mantenimiento 5000 km completo', NULL),
(3, '2026-10-05', 71210, 'Preventivo', 'Alineamiento, balanceo y cambio de aceite', NULL),
(4, '2026-10-20', 48700, 'Preventivo', 'Revisión sistema eléctrico y suspensión', NULL),
(6, '2026-11-10', 63400, 'Correctivo', 'Reparación de alternador y sistema de carga', NULL);
GO

-- Documentos de Unidades
INSERT INTO DocumentoUnidad (id_unidad, tipo, numero, fecha_vencimiento) VALUES
(1, 'SOAT', 'SOAT-2025-88412', '2026-11-24'),
(1, 'Revisión Técnica', 'CITV-2026-11024', '2027-03-15'),
(2, 'SOAT', 'SOAT-2026-55210', '2027-05-20'),
(2, 'Revisión Técnica', 'CITV-2025-99201', '2026-11-09'),
(3, 'SOAT', 'SOAT-2026-77120', '2027-06-10'),
(4, 'SOAT', 'SOAT-2026-66301', '2027-04-02');
GO

-- Incidentes
INSERT INTO Incidente (id_unidad, fecha, descripcion) VALUES
(1, '2026-11-03 16:30:00', 'Falla menor en sensor de puerta posterior durante ruta a Supe Puerto.'),
(2, '2026-10-28 08:15:00', 'Pinchazo en neumático trasero derecho en Av. Los Próceres.');
GO

-- Reportes Grifo & Cierre Trimestral
INSERT INTO ReporteGrifo (anio, trimestre, galones_total, observaciones) VALUES
(2026, 3, 3392.57, 'Factura consolidada Grifo Primax Barranca - Trimestre III'),
(2026, 4, 1526.00, 'Corte parcial al 12/11/2026');
GO

INSERT INTO CierreTrimestral (anio, trimestre, fecha_cierre) VALUES
(2026, 3, '2026-09-30');
GO

INSERT INTO CierreUnidad (id_cierre, id_unidad, km_recorridos, galones, rendimiento, km_acumulado) VALUES
(1, 1, 8450, 918.48, 9.20, 181919),
(1, 2, 7920, 784.16, 10.10, 94743),
(1, 3, 8110, 844.79, 9.60, 70103),
(1, 4, 7560, 771.43, 9.80, 47093);
GO
