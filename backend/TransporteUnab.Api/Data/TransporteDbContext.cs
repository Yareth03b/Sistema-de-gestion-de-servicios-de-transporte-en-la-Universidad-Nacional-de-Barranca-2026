using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Data;

/// <summary>
/// Mapeo EF Core alineado con ScriptBD.sql (fuente de verdad del esquema).
/// Tablas en PascalCase, columnas en snake_case, textos VARCHAR (no NVARCHAR),
/// fechas DATE / TIME(0) / DATETIME / DATETIME2(0) según el script.
/// Las restricciones (UNIQUE, CHECK, FK) se declaran solo para que el modelo
/// las conozca: la BD ya existe y no se generan migraciones desde aquí.
/// </summary>
public class TransporteDbContext : DbContext
{
    public TransporteDbContext(DbContextOptions<TransporteDbContext> options) : base(options) { }

    public DbSet<Rol> Roles => Set<Rol>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<UnidadTransporte> Unidades => Set<UnidadTransporte>();
    public DbSet<Conductor> Conductores => Set<Conductor>();
    public DbSet<AreaSolicitante> Areas => Set<AreaSolicitante>();
    public DbSet<Ruta> Rutas => Set<Ruta>();
    public DbSet<BitacoraTurno> BitacoraTurnos => Set<BitacoraTurno>();
    public DbSet<TurnoRuta> TurnoRutas => Set<TurnoRuta>();
    public DbSet<Abastecimiento> Abastecimientos => Set<Abastecimiento>();
    public DbSet<CierreTrimestral> CierresTrimestrales => Set<CierreTrimestral>();
    public DbSet<CierreUnidad> CierresUnidad => Set<CierreUnidad>();
    public DbSet<ReporteGrifo> ReportesGrifo => Set<ReporteGrifo>();
    public DbSet<Mantenimiento> Mantenimientos => Set<Mantenimiento>();
    public DbSet<DocumentoUnidad> DocumentosUnidad => Set<DocumentoUnidad>();
    public DbSet<Incidente> Incidentes => Set<Incidente>();
    public DbSet<EstimacionViaje> EstimacionesViaje => Set<EstimacionViaje>();
    public DbSet<RegistroSesion> RegistrosSesion => Set<RegistroSesion>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Todas las columnas de texto del script son VARCHAR: sin esto EF envía
        // parámetros NVARCHAR y SQL Server convierte la columna en cada consulta
        // (con collation SQL_Latin1 eso impide usar los índices UNIQUE).
        configurationBuilder.Properties<string>().AreUnicode(false);
    }

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Rol>(e =>
        {
            e.HasIndex(x => x.nombre_rol).IsUnique().HasDatabaseName("UQ_Rol_NombreRol");
        });

        mb.Entity<Usuario>(e =>
        {
            e.HasIndex(x => x.nombre_usuario).IsUnique().HasDatabaseName("UQ_Usuario_NombreUsuario");
            e.HasOne(x => x.Rol).WithMany().HasForeignKey(x => x.id_rol)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_Usuario_Rol");
        });

        mb.Entity<UnidadTransporte>(e =>
        {
            e.HasIndex(x => x.placa).IsUnique().HasDatabaseName("UQ_UnidadTransporte_Placa");
            e.HasOne<Usuario>().WithMany().HasForeignKey(x => x.id_usuario)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_UnidadTransporte_Usuario");
        });

        mb.Entity<Conductor>(e =>
        {
            e.Property(x => x.dni).HasColumnType("char(8)").IsFixedLength();
            e.HasIndex(x => x.dni).IsUnique().HasDatabaseName("UQ_Conductor_Dni");
            e.ToTable(t => t.HasCheckConstraint("CK_Conductor_Dni",
                "dni LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'"));
            e.HasOne(x => x.Unidad).WithMany().HasForeignKey(x => x.id_unidad)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_Conductor_Unidad");
        });

        mb.Entity<BitacoraTurno>(e =>
        {
            e.Property(x => x.fecha).HasColumnType("date");
            e.Property(x => x.hora_salida).HasColumnType("time(0)");
            e.Property(x => x.hora_llegada).HasColumnType("time(0)");
            e.Property(x => x.km_recorridos).HasComputedColumnSql("[km_final] - [km_inicial]", stored: false);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_BitacoraTurno_Km", "km_final > km_inicial");
                t.HasCheckConstraint("CK_BitacoraTurno_Horas", "hora_llegada > hora_salida");
            });
            e.HasOne(x => x.Unidad).WithMany().HasForeignKey(x => x.id_unidad)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_BitacoraTurno_Unidad");
            e.HasOne(x => x.Conductor).WithMany().HasForeignKey(x => x.id_conductor)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_BitacoraTurno_Conductor");
        });

        mb.Entity<TurnoRuta>(e =>
        {
            e.HasOne(x => x.Turno).WithMany().HasForeignKey(x => x.id_turno)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_TurnoRuta_Turno");
            e.HasOne(x => x.Ruta).WithMany().HasForeignKey(x => x.id_ruta)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_TurnoRuta_Ruta");
        });

        mb.Entity<Abastecimiento>(e =>
        {
            e.Property(x => x.fecha).HasColumnType("date");
            e.Property(x => x.galones).HasColumnType("decimal(8,2)");
            e.HasIndex(x => x.nro_vale).IsUnique().HasDatabaseName("UQ_Abastecimiento_NroVale");
            e.ToTable(t => t.HasCheckConstraint("CK_Abastecimiento_Galones", "galones > 0"));
            e.HasOne(x => x.Unidad).WithMany().HasForeignKey(x => x.id_unidad)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_Abastecimiento_Unidad");
            e.HasOne(x => x.Conductor).WithMany().HasForeignKey(x => x.id_conductor)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_Abastecimiento_Conductor");
            e.HasOne(x => x.Area).WithMany().HasForeignKey(x => x.id_area)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_Abastecimiento_Area");
        });

        mb.Entity<CierreTrimestral>(e =>
        {
            e.Property(x => x.fecha_cierre).HasColumnType("date");
            e.HasIndex(x => new { x.anio, x.trimestre }).IsUnique()
                .HasDatabaseName("UQ_CierreTrimestral_AnioTrimestre");
            e.ToTable(t => t.HasCheckConstraint("CK_CierreTrimestral_Trimestre", "trimestre BETWEEN 1 AND 4"));
        });

        mb.Entity<CierreUnidad>(e =>
        {
            e.Property(x => x.galones).HasColumnType("decimal(10,2)");
            e.Property(x => x.rendimiento).HasColumnType("decimal(8,2)");
            e.HasIndex(x => new { x.id_cierre, x.id_unidad }).IsUnique()
                .HasDatabaseName("UQ_CierreUnidad_CierreUnidad");
            e.HasOne<CierreTrimestral>().WithMany().HasForeignKey(x => x.id_cierre)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_CierreUnidad_Cierre");
            e.HasOne<UnidadTransporte>().WithMany().HasForeignKey(x => x.id_unidad)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_CierreUnidad_Unidad");
        });

        mb.Entity<ReporteGrifo>(e =>
        {
            e.Property(x => x.galones_total).HasColumnType("decimal(10,2)");
            e.HasIndex(x => new { x.anio, x.trimestre }).IsUnique()
                .HasDatabaseName("UQ_ReporteGrifo_AnioTrimestre");
            e.ToTable(t => t.HasCheckConstraint("CK_ReporteGrifo_Trimestre", "trimestre BETWEEN 1 AND 4"));
        });

        mb.Entity<Mantenimiento>(e =>
        {
            e.ToTable(t => t.HasCheckConstraint("CK_Mantenimiento_Salida",
                "fecha_salida IS NULL OR fecha_salida >= fecha"));
            e.Property(x => x.fecha).HasColumnType("date");
            e.Property(x => x.fecha_salida).HasColumnType("date");
            e.HasOne<UnidadTransporte>().WithMany().HasForeignKey(x => x.id_unidad)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_Mantenimiento_Unidad");
        });

        mb.Entity<DocumentoUnidad>(e =>
        {
            e.Property(x => x.fecha_vencimiento).HasColumnType("date");
            e.HasOne<UnidadTransporte>().WithMany().HasForeignKey(x => x.id_unidad)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_DocumentoUnidad_Unidad");
        });

        mb.Entity<Incidente>(e =>
        {
            e.Property(x => x.fecha).HasColumnType("datetime");
            e.HasOne<UnidadTransporte>().WithMany().HasForeignKey(x => x.id_unidad)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_Incidente_Unidad");
        });

        mb.Entity<EstimacionViaje>(e =>
        {
            e.Property(x => x.fecha).HasColumnType("date");
            e.Property(x => x.rendimiento_promedio).HasColumnType("decimal(8,2)");
            e.Property(x => x.precio_galon).HasColumnType("decimal(8,2)");
            e.Property(x => x.costo_estimado).HasColumnType("decimal(10,2)");
            e.HasOne<UnidadTransporte>().WithMany().HasForeignKey(x => x.id_unidad)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_EstimacionViaje_Unidad");
        });

        mb.Entity<RegistroSesion>(e =>
        {
            e.Property(x => x.fecha_hora_inicio).HasColumnType("datetime2(0)")
                .HasDefaultValueSql("SYSDATETIME()");
            e.Property(x => x.fecha_hora_salida).HasColumnType("datetime2(0)");
            e.ToTable(t => t.HasCheckConstraint("CK_RegistroSesion_Fechas",
                "fecha_hora_salida IS NULL OR fecha_hora_salida >= fecha_hora_inicio"));
            e.HasOne<Usuario>().WithMany().HasForeignKey(x => x.id_usuario)
                .OnDelete(DeleteBehavior.NoAction).HasConstraintName("FK_RegistroSesion_Usuario");
        });
    }
}
