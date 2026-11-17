USE BD_TRANSPORTE;
GO

-- Roles base del sistema
INSERT INTO Rol (nombre_rol) VALUES
('Administrador'),
('Encargado de Transporte'),
('Operador');
GO

-- Usuario administrador inicial para poder iniciar sesión y registrar los datos reales desde el sistema
INSERT INTO Usuario (id_rol, nombres, apellidos, nombre_usuario, contrasenia, activo) VALUES
(1, 'Encargado', 'de Transporte', 'admin', 'admin123', 1);
GO
