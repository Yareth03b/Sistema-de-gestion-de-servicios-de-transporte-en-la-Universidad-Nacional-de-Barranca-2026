using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Servicios;

/// <summary>
/// Estado de taller DERIVADO de Mantenimiento (no se guarda ni hay procesos en segundo plano):
/// un bus está «En mantenimiento» el día D si tiene un mantenimiento con fecha (ingreso) &lt;= D
/// y (fecha_salida IS NULL o fecha_salida &gt; D). El día de la salida ya está operativo desde las 00:00 de Lima.
/// </summary>
public static class Taller
{
    public const string EstadoEnMantenimiento = "En mantenimiento";

    /// <summary>Mantenimientos que tienen el bus en taller el día indicado (traducible a SQL).</summary>
    public static IQueryable<Mantenimiento> EnTallerEl(this IQueryable<Mantenimiento> q, DateTime dia)
        => q.EnTallerEntre(dia, dia);

    /// <summary>
    /// Mantenimientos que tienen el bus en taller algún día de [desde, hasta] (traducible a SQL):
    /// ingreso &lt;= hasta y (sin salida o salida &gt; desde). Con desde = hasta es la regla de un solo día.
    /// </summary>
    public static IQueryable<Mantenimiento> EnTallerEntre(this IQueryable<Mantenimiento> q, DateTime desde, DateTime hasta)
    {
        var d = desde.Date;
        var h = hasta.Date;
        return q.Where(m => m.fecha <= h && (m.fecha_salida == null || m.fecha_salida > d));
    }

    /// <summary>Días en taller = salida − ingreso; si sigue abierto, hoy − ingreso (Lima). Mismo día = 0.</summary>
    public static int DiasEnTaller(DateTime fecha, DateTime? fechaSalida)
        => Math.Max(0, ((fechaSalida ?? HoraPeru.Hoy).Date - fecha.Date).Days);

    /// <summary>Estado que se muestra: «En mantenimiento» si está en taller (solo unidades activas); si no, el guardado.</summary>
    public static string? EstadoDerivado(bool activo, string? estadoGuardado, bool enTaller)
        => activo && enTaller ? EstadoEnMantenimiento : estadoGuardado;

    public record InfoTaller(int id_mantenimiento, DateTime fecha, DateTime? fecha_salida);

    /// <summary>Por unidad, el mantenimiento que la tiene en taller el día indicado (el de ingreso más reciente).</summary>
    public static async Task<Dictionary<int, InfoTaller>> EnTallerPorUnidad(TransporteDbContext db, DateTime dia,
        ICollection<int>? idsUnidad = null)
    {
        var q = db.Mantenimientos.AsNoTracking().EnTallerEl(dia);
        if (idsUnidad is not null) q = q.Where(m => idsUnidad.Contains(m.id_unidad));
        var filas = await q.Select(m => new { m.id_unidad, m.id_mantenimiento, m.fecha, m.fecha_salida }).ToListAsync();
        return filas
            .GroupBy(m => m.id_unidad)
            .ToDictionary(g => g.Key, g =>
            {
                var m = g.OrderByDescending(x => x.fecha).ThenByDescending(x => x.id_mantenimiento).First();
                return new InfoTaller(m.id_mantenimiento, m.fecha, m.fecha_salida);
            });
    }

    /// <summary>
    /// Regla: un solo mantenimiento abierto (fecha_salida NULL) por bus.
    /// Lanza 409 si el bus ya tiene uno abierto distinto de <paramref name="excepto"/>.
    /// </summary>
    public static async Task ValidarUnoAbierto(TransporteDbContext db, UnidadTransporte unidad, int? excepto = null)
    {
        var abierto = await db.Mantenimientos.AsNoTracking()
            .Where(m => m.id_unidad == unidad.id_unidad && m.fecha_salida == null && m.id_mantenimiento != (excepto ?? 0))
            .OrderByDescending(m => m.fecha)
            .Select(m => new { m.id_mantenimiento, m.fecha })
            .FirstOrDefaultAsync();
        if (abierto is not null)
            throw ReglaException.Conflicto(
                $"El bus {unidad.placa} ya está en taller desde el {abierto.fecha:dd/MM/yyyy} (mantenimiento {abierto.id_mantenimiento}). " +
                "Registre su salida antes de un nuevo ingreso.");
    }

    /// <summary>Aviso (no bloquea) cuando se registra un turno de un bus que está en taller ese día.</summary>
    public static async Task<string?> AvisoTurno(TransporteDbContext db, int idUnidad, string? placa, DateTime fechaTurno)
    {
        var m = await db.Mantenimientos.AsNoTracking()
            .Where(x => x.id_unidad == idUnidad).EnTallerEl(fechaTurno)
            .OrderByDescending(x => x.fecha)
            .Select(x => new { x.id_mantenimiento, x.fecha })
            .FirstOrDefaultAsync();
        return m is null
            ? null
            : $"El bus {placa} figura en taller el {fechaTurno:dd/MM/yyyy} (ingresó el {m.fecha:dd/MM/yyyy}, mantenimiento {m.id_mantenimiento}). " +
              "El turno se guardó; si el bus ya salió, registre la salida del mantenimiento.";
    }
}
