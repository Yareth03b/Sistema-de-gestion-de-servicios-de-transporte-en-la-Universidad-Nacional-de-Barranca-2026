# Sistema de Gestión de Servicios de Transporte — UNAB

Sistema web integral para la gestión operativa de la flota vehicular, bitácora de turnos, abastecimiento de combustible, mantenimientos, conductores, rutas, reportes trimestrales, conciliación con grifo y estimación de costos de viaje de la Universidad Nacional de Barranca (Área de Transporte · Servicios Generales).

## Estructura del Proyecto

- `database/`
  - `BD_TRANSPORTE.sql`: Script DDL completo en SQL Server (17 tablas, restricciones y claves foráneas).
  - `seed.sql`: Datos iniciales de prueba (roles, usuarios, flota, conductores, rutas, turnos y vales).
- `backend/TransporteUnab.Api/`
  - API REST en C# (ASP.NET Core .NET 10 + Entity Framework Core SQL Server) organizada por controladores modulares (`Auth`, `Dashboard`, `Turnos`, `Combustible`, `Unidades`, `Mantenimiento`, `Conductores`, `Rutas`, `Reportes`, `Conciliacion`, `Estimacion`).
- `frontend/`
  - Interfaz web en HTML5, CSS3 (tokens 8pt grid, Poppins + Playfair Display) y JavaScript modular ES6 basada en el diseño de Figma.
  - Funciona conectado al API C# y cuenta con respaldo local persistente (`localStorage`) automático cuando el API no está ejecutándose.

## Cómo ejecutar

### 1. Base de datos (SQL Server)
Ejecutar en SQL Server Management Studio (SSMS) o `sqlcmd`:
1. `database/BD_TRANSPORTE.sql`
2. `database/seed.sql`

### 2. Backend API C#
Configurar la cadena de conexión en `backend/TransporteUnab.Api/appsettings.json` y ejecutar:
```bash
cd backend/TransporteUnab.Api
dotnet run --urls http://localhost:5000
```

### 3. Frontend
Abrir `frontend/index.html` con un servidor estático (por ejemplo Live Server o `npx serve frontend`).
Credenciales de prueba: `admin` / `admin123`.
