using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Data;

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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<BitacoraTurno>()
            .Property(t => t.km_recorridos)
            .HasComputedColumnSql("[km_final] - [km_inicial]", stored: false);
    }
}
