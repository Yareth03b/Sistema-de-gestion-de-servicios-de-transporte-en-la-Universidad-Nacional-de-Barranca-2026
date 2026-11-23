CREATE DATABASE BD_TRANSPORTE;
GO

USE BD_TRANSPORTE;
GO

CREATE TABLE Rol (
    id_rol     INT IDENTITY(1,1) PRIMARY KEY,
    nombre_rol VARCHAR(50) NOT NULL,
    CONSTRAINT UQ_Rol_NombreRol UNIQUE (nombre_rol)
);
GO

CREATE TABLE Usuario (
    id_usuario     INT IDENTITY(1,1) PRIMARY KEY,
    id_rol         INT NOT NULL,
    nombres        VARCHAR(80) NOT NULL,
    apellidos      VARCHAR(80) NOT NULL,
    nombre_usuario VARCHAR(50) NOT NULL,
    contrasenia    VARCHAR(256) NOT NULL,
    activo         BIT NOT NULL,
    CONSTRAINT UQ_Usuario_NombreUsuario UNIQUE (nombre_usuario),
    CONSTRAINT FK_Usuario_Rol
        FOREIGN KEY (id_rol) REFERENCES Rol(id_rol)
);
GO

CREATE TABLE UnidadTransporte (
    id_unidad          INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario         INT NULL,
    placa              VARCHAR(10) NOT NULL,
    tipo               VARCHAR(30) NOT NULL,
    marca              VARCHAR(50) NOT NULL,
    modelo             VARCHAR(50) NOT NULL,
    codigo_patrimonial VARCHAR(30) NULL,
    capacidad          INT NULL,
    estado             VARCHAR(20) NULL,
    activo             BIT NOT NULL,
    CONSTRAINT UQ_UnidadTransporte_Placa UNIQUE (placa),
    CONSTRAINT FK_UnidadTransporte_Usuario
        FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario)
);
GO

CREATE TABLE Conductor (
    id_conductor INT IDENTITY(1,1) PRIMARY KEY,
    id_unidad    INT NULL,
    dni          CHAR(8) NOT NULL,
    nombres      VARCHAR(80) NOT NULL,
    apellidos    VARCHAR(80) NOT NULL,
    brevete      VARCHAR(15) NULL,
    activo       BIT NOT NULL,
    CONSTRAINT UQ_Conductor_Dni UNIQUE (dni),
    CONSTRAINT CK_Conductor_Dni
        CHECK (dni LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    CONSTRAINT FK_Conductor_Unidad
        FOREIGN KEY (id_unidad) REFERENCES UnidadTransporte(id_unidad)
);
GO

CREATE TABLE AreaSolicitante (
    id_area INT IDENTITY(1,1) PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL
);
GO

CREATE TABLE Ruta (
    id_ruta       INT IDENTITY(1,1) PRIMARY KEY,
    punto_salida  VARCHAR(100) NOT NULL,
    punto_llegada VARCHAR(100) NOT NULL,
    km_referencia INT NOT NULL
);
GO

CREATE TABLE BitacoraTurno (
    id_turno      INT IDENTITY(1,1) PRIMARY KEY,
    id_unidad     INT NOT NULL,
    id_conductor  INT NOT NULL,
    fecha         DATE NOT NULL,
    hora_salida   TIME(0) NOT NULL,
    hora_llegada  TIME(0) NOT NULL,
    km_inicial    INT NOT NULL,
    km_final      INT NOT NULL,
    km_recorridos AS (km_final - km_inicial),
    observaciones VARCHAR(300) NULL,
    CONSTRAINT CK_BitacoraTurno_Km CHECK (km_final > km_inicial),
    CONSTRAINT CK_BitacoraTurno_Horas CHECK (hora_llegada > hora_salida),
    CONSTRAINT FK_BitacoraTurno_Unidad
        FOREIGN KEY (id_unidad) REFERENCES UnidadTransporte(id_unidad),
    CONSTRAINT FK_BitacoraTurno_Conductor
        FOREIGN KEY (id_conductor) REFERENCES Conductor(id_conductor)
);
GO

CREATE TABLE TurnoRuta (
    id_turno_ruta INT IDENTITY(1,1) PRIMARY KEY,
    id_turno      INT NOT NULL,
    id_ruta       INT NOT NULL,
    CONSTRAINT FK_TurnoRuta_Turno
        FOREIGN KEY (id_turno) REFERENCES BitacoraTurno(id_turno),
    CONSTRAINT FK_TurnoRuta_Ruta
        FOREIGN KEY (id_ruta) REFERENCES Ruta(id_ruta)
);
GO

CREATE TABLE Abastecimiento (
    id_abastecimiento INT IDENTITY(1,1) PRIMARY KEY,
    id_unidad         INT NOT NULL,
    id_conductor      INT NOT NULL,
    id_area           INT NULL,
    nro_vale          VARCHAR(20) NOT NULL,
    fecha             DATE NOT NULL,
    km_actual         INT NOT NULL,
    galones           DECIMAL(8,2) NOT NULL,
    tipo_combustible  VARCHAR(20) NOT NULL,
    observaciones     VARCHAR(300) NULL,
    CONSTRAINT UQ_Abastecimiento_NroVale UNIQUE (nro_vale),
    CONSTRAINT CK_Abastecimiento_Galones CHECK (galones > 0),
    CONSTRAINT FK_Abastecimiento_Unidad
        FOREIGN KEY (id_unidad) REFERENCES UnidadTransporte(id_unidad),
    CONSTRAINT FK_Abastecimiento_Conductor
        FOREIGN KEY (id_conductor) REFERENCES Conductor(id_conductor),
    CONSTRAINT FK_Abastecimiento_Area
        FOREIGN KEY (id_area) REFERENCES AreaSolicitante(id_area)
);
GO

-- ============================================================
-- Modulo 2: Reportes y conciliacion
-- ============================================================

CREATE TABLE CierreTrimestral (
    id_cierre    INT IDENTITY(1,1) PRIMARY KEY,
    anio         SMALLINT NOT NULL,
    trimestre    TINYINT NOT NULL,
    fecha_cierre DATE NOT NULL,
    CONSTRAINT UQ_CierreTrimestral_AnioTrimestre UNIQUE (anio, trimestre),
    CONSTRAINT CK_CierreTrimestral_Trimestre CHECK (trimestre BETWEEN 1 AND 4)
);
GO

CREATE TABLE CierreUnidad (
    id_cierre_unidad INT IDENTITY(1,1) PRIMARY KEY,
    id_cierre        INT NOT NULL,
    id_unidad        INT NOT NULL,
    km_recorridos    INT NOT NULL,
    galones          DECIMAL(10,2) NOT NULL,
    rendimiento      DECIMAL(8,2) NULL,
    km_acumulado     INT NOT NULL,
    CONSTRAINT UQ_CierreUnidad_CierreUnidad UNIQUE (id_cierre, id_unidad),
    CONSTRAINT FK_CierreUnidad_Cierre
        FOREIGN KEY (id_cierre) REFERENCES CierreTrimestral(id_cierre),
    CONSTRAINT FK_CierreUnidad_Unidad
        FOREIGN KEY (id_unidad) REFERENCES UnidadTransporte(id_unidad)
);
GO

CREATE TABLE ReporteGrifo (
    id_reporte    INT IDENTITY(1,1) PRIMARY KEY,
    anio          SMALLINT NOT NULL,
    trimestre     TINYINT NOT NULL,
    galones_total DECIMAL(10,2) NOT NULL,
    observaciones VARCHAR(300) NULL,
    CONSTRAINT UQ_ReporteGrifo_AnioTrimestre UNIQUE (anio, trimestre),
    CONSTRAINT CK_ReporteGrifo_Trimestre CHECK (trimestre BETWEEN 1 AND 4)
);
GO

CREATE TABLE Mantenimiento (
    id_mantenimiento INT IDENTITY(1,1) PRIMARY KEY,
    id_unidad        INT NOT NULL,
    fecha            DATE NOT NULL,
    km               INT NOT NULL,
    tipo             VARCHAR(20) NOT NULL,
    detalle          VARCHAR(300) NULL,
    foto             VARCHAR(260) NULL,
    fecha_salida     DATE NULL,
    CONSTRAINT FK_Mantenimiento_Unidad
        FOREIGN KEY (id_unidad) REFERENCES UnidadTransporte(id_unidad),
    CONSTRAINT CK_Mantenimiento_Salida
        CHECK (fecha_salida IS NULL OR fecha_salida >= fecha)
);
GO

CREATE TABLE DocumentoUnidad (
    id_documento      INT IDENTITY(1,1) PRIMARY KEY,
    id_unidad         INT NOT NULL,
    tipo              VARCHAR(20) NOT NULL,
    numero            VARCHAR(30) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    CONSTRAINT FK_DocumentoUnidad_Unidad
        FOREIGN KEY (id_unidad) REFERENCES UnidadTransporte(id_unidad)
);
GO

CREATE TABLE Incidente (
    id_incidente INT IDENTITY(1,1) PRIMARY KEY,
    id_unidad    INT NOT NULL,
    fecha        DATETIME NOT NULL,
    descripcion  VARCHAR(300) NOT NULL,
    CONSTRAINT FK_Incidente_Unidad
        FOREIGN KEY (id_unidad) REFERENCES UnidadTransporte(id_unidad)
);
GO

CREATE TABLE SolicitudViaje (
    id_solicitud      INT IDENTITY(1,1) PRIMARY KEY,
    codigo            VARCHAR(30)  NOT NULL,
    id_area           INT          NOT NULL,
    encargado         VARCHAR(100) NOT NULL,
    fecha_salida      DATE         NOT NULL,
    hora_salida       TIME(0)      NOT NULL,
    fecha_regreso     DATE         NOT NULL,
    hora_regreso      TIME(0)      NOT NULL,
    lugar_procedencia VARCHAR(100) NOT NULL,
    lugar_destino     VARCHAR(100) NOT NULL,
    motivo            VARCHAR(300) NOT NULL,
    pasajeros         INT          NOT NULL,
    estado            VARCHAR(20)  NOT NULL
        CONSTRAINT DF_SolicitudViaje_Estado DEFAULT 'Pendiente',
    observaciones     VARCHAR(300) NULL,
    CONSTRAINT UQ_SolicitudViaje_Codigo UNIQUE (codigo),
    CONSTRAINT FK_SolicitudViaje_Area
        FOREIGN KEY (id_area) REFERENCES AreaSolicitante(id_area),
    CONSTRAINT CK_SolicitudViaje_Pasajeros CHECK (pasajeros > 0),
    CONSTRAINT CK_SolicitudViaje_Estado
        CHECK (estado IN ('Pendiente','Estimada','Aprobada','Rechazada')),
    CONSTRAINT CK_SolicitudViaje_Fechas CHECK (
        fecha_regreso > fecha_salida
        OR (fecha_regreso = fecha_salida AND hora_regreso > hora_salida))
);
GO

CREATE TABLE EstimacionViaje (
    id_estimacion        INT IDENTITY(1,1) PRIMARY KEY,
    id_unidad            INT NOT NULL,
    id_solicitud         INT NULL,
    fecha                DATE NOT NULL,
    destino              VARCHAR(100) NOT NULL,
    distancia_km         INT NOT NULL,
    rendimiento_promedio DECIMAL(8,2) NOT NULL,
    precio_galon         DECIMAL(8,2) NOT NULL,
    costo_estimado       DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_EstimacionViaje_Unidad
        FOREIGN KEY (id_unidad) REFERENCES UnidadTransporte(id_unidad),
    CONSTRAINT FK_EstimacionViaje_Solicitud
        FOREIGN KEY (id_solicitud) REFERENCES SolicitudViaje(id_solicitud)
);
GO

CREATE TABLE RegistroSesion (
    id_sesion         INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario        INT NOT NULL,
    fecha_hora_inicio DATETIME2(0) NOT NULL
        CONSTRAINT DF_RegistroSesion_Inicio DEFAULT SYSDATETIME(),
    fecha_hora_salida DATETIME2(0) NULL,
    CONSTRAINT FK_RegistroSesion_Usuario
        FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario),
    CONSTRAINT CK_RegistroSesion_Fechas CHECK (
        fecha_hora_salida IS NULL OR fecha_hora_salida >= fecha_hora_inicio
    )
);
GO
