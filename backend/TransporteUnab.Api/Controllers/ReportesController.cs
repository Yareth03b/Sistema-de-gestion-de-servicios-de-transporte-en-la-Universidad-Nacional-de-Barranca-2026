using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportesController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public ReportesController(TransporteDbContext db) => _db = db;

    public record CierreRequest(short anio, byte trimestre);

    [HttpGet("trimestral")]
    public async Task<IActionResult> GetCierres()
    {
        var cierres = await _db.CierresTrimestrales.AsNoTracking()
            .OrderByDescending(c => c.anio).ThenByDescending(c => c.trimestre)
            .ToListAsync();

        var ids = cierres.Select(c => c.id_cierre).ToList();
        var filas = (await _db.CierresUnidad.AsNoTracking()
                .Where(cu => ids.Contains(cu.id_cierre))
                .Join(_db.Unidades, cu => cu.id_unidad, u => u.id_unidad, (cu, u) => new
                {
                    cu.id_cierre,
                    cu.id_unidad,
                    u.placa,
                    u.tipo,
                    cu.km_recorridos,
                    cu.galones,
                    cu.rendimiento,
                    cu.km_acumulado
                })
                .OrderBy(x => x.placa)
                .ToListAsync())
            .GroupBy(x => x.id_cierre)
            .ToDictionary(g => g.Key, g => g.ToList());

        return Ok(cierres.Select(c => new
        {
            c.id_cierre,
            c.anio,
            c.trimestre,
            fecha_cierre = c.fecha_cierre.ToString("yyyy-MM-dd"),
            unidades = (filas.GetValueOrDefault(c.id_cierre) ?? new()).Select(u => new
            {
                u.id_unidad,
                u.placa,
                u.tipo,
                u.km_recorridos,
                u.galones,
                u.rendimiento,
                u.km_acumulado
            })
        }));
    }

    /// <summary>
    /// HU-15: cierra el trimestre y guarda la foto de cada unidad en CierreUnidad, en una sola transacción.
    /// rendimiento = km consumidos del trimestre ÷ galones del trimestre (null si no se puede calcular).
    /// </summary>
    [HttpPost("cerrar-trimestre")]
    public async Task<IActionResult> CerrarTrimestre([FromBody] CierreRequest req)
    {
        ValidarTrimestre(req);
        if (await _db.CierresTrimestrales.AnyAsync(c => c.anio == req.anio && c.trimestre == req.trimestre))
            throw ReglaException.Conflicto($"El trimestre {req.trimestre} de {req.anio} ya fue cerrado.");

        var estrategia = _db.Database.CreateExecutionStrategy();
        var cierre = await estrategia.ExecuteAsync(async () =>
        {
            _db.ChangeTracker.Clear();
            await using var tx = await _db.Database.BeginTransactionAsync();
            var c = new CierreTrimestral { anio = req.anio, trimestre = req.trimestre, fecha_cierre = HoraPeru.Hoy };
            _db.CierresTrimestrales.Add(c);
            await _db.SaveChangesAsync();
            await Calculos.CalcularCierre(_db, c);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return c;
        });
        return Ok(cierre);
    }

    /// <summary>V-12 / S-05: botón «Actualizar cierre». Recalcula la foto guardada de un trimestre cerrado.</summary>
    [HttpPost("actualizar-cierre")]
    public async Task<IActionResult> ActualizarCierre([FromBody] CierreRequest req)
    {
        ValidarTrimestre(req);
        var cierre = await _db.CierresTrimestrales.FirstOrDefaultAsync(c => c.anio == req.anio && c.trimestre == req.trimestre)
                     ?? throw ReglaException.NoEncontrado($"El trimestre {req.trimestre} de {req.anio} no está cerrado.");
        await Calculos.CalcularCierre(_db, cierre);
        await _db.SaveChangesAsync();
        return Ok(cierre);
    }

    private static void ValidarTrimestre(CierreRequest req)
    {
        if (req.trimestre is < 1 or > 4) throw new ReglaException("El trimestre debe estar entre 1 y 4.");
        if (req.anio < 2000) throw new ReglaException("El año no es válido.");
        if (Calculos.RangoTrimestre(req.anio, req.trimestre).inicio > HoraPeru.Hoy)
            throw new ReglaException("No se puede cerrar un trimestre que aún no empieza.", "V-06");
    }

    /// <summary>
    /// Reporte por unidad de un periodo (panel 09).
    /// Periodo: ?mes=yyyy-MM, o ?desde=yyyy-MM-dd y ?hasta=yyyy-MM-dd (ambos inclusive). Sin parámetros: el mes actual.
    /// Filtro opcional ?id_unidad=. ?dias=calendario (por defecto) o habiles, para el promedio diario.
    /// km del periodo, galones y rendimiento se calculan como en el cierre trimestral (Calculos.ResumirPeriodo):
    /// rendimiento = km del periodo ÷ galones del periodo, nunca un promedio de rendimientos.
    /// </summary>
    [HttpGet("por-unidad")]
    public async Task<IActionResult> PorUnidad([FromQuery] string? mes, [FromQuery] DateTime? desde, [FromQuery] DateTime? hasta,
        [FromQuery] int? id_unidad, [FromQuery] string? dias)
    {
        var hoy = HoraPeru.Hoy;
        var (inicio, fin) = Periodo(mes, desde, hasta, hoy);
        var habiles = (dias ?? "calendario").Trim().ToLowerInvariant() switch
        {
            "calendario" => false,
            "habiles" or "hábiles" => true,
            _ => throw new ReglaException("El parámetro 'dias' debe ser 'calendario' o 'habiles'.")
        };

        // Días contados: desde el inicio hasta el fin del periodo o hasta hoy, lo que ocurra primero.
        var finConteo = fin < hoy ? fin : hoy;
        var diasContados = ContarDias(inicio, finConteo, habiles);

        var finExclusivo = fin.AddDays(1);
        var unidadesQ = _db.Unidades.AsNoTracking();
        if (id_unidad is int idU)
        {
            if (!await unidadesQ.AnyAsync(u => u.id_unidad == idU))
                throw ReglaException.NoEncontrado($"La unidad {idU} no existe.");
            unidadesQ = unidadesQ.Where(u => u.id_unidad == idU);
        }
        else
        {
            // Como en el cierre: unidades activas y las dadas de baja con vales o turnos en el periodo.
            unidadesQ = unidadesQ.Where(u => u.activo
                || _db.Abastecimientos.Any(a => a.id_unidad == u.id_unidad && a.fecha >= inicio && a.fecha < finExclusivo)
                || _db.BitacoraTurnos.Any(t => t.id_unidad == u.id_unidad && t.fecha >= inicio && t.fecha < finExclusivo));
        }
        var unidades = await unidadesQ.OrderBy(u => u.placa)
            .Select(u => new { u.id_unidad, u.placa, u.tipo, u.activo }).ToListAsync();

        var ids = unidades.Select(u => u.id_unidad).ToList();
        var vales = await _db.Abastecimientos.AsNoTracking()
            .Where(a => ids.Contains(a.id_unidad) && a.fecha >= inicio && a.fecha < finExclusivo)
            .GroupBy(a => a.id_unidad).Select(g => new { id = g.Key, n = g.Count() })
            .ToDictionaryAsync(x => x.id, x => x.n);

        var filas = new List<FilaReporte>();
        foreach (var u in unidades)
        {
            var r = await Calculos.ResumirPeriodo(_db, u.id_unidad, inicio, finExclusivo);
            var fuente = r.km_consumidos is not null ? "vales" : r.km_recorridos > 0 ? "bitacora" : null;
            filas.Add(new FilaReporte(u.id_unidad, u.placa, Reglas.NumeroBus(u.placa), u.tipo, u.activo,
                r.km_recorridos, fuente, r.galones, vales.GetValueOrDefault(u.id_unidad), r.rendimiento, r.km_acumulado,
                PorDia(r.km_recorridos, diasContados), r.km_consumidos));
        }

        // Rendimiento de la flota = Σ km ÷ Σ galones de las unidades con rendimiento calculable (no un promedio).
        var conRend = filas.Where(f => f.rendimiento is not null).ToList();
        var totalKm = filas.Sum(f => f.km_periodo);

        return Ok(new
        {
            periodo = new
            {
                desde = inicio.ToString("yyyy-MM-dd"),
                hasta = fin.ToString("yyyy-MM-dd"),
                dias = habiles ? "habiles" : "calendario",
                dias_contados = diasContados,
                dias_hasta = finConteo.ToString("yyyy-MM-dd")
            },
            totales = new
            {
                km_periodo = totalKm,
                galones = filas.Sum(f => f.galones),
                vales = filas.Sum(f => f.vales),
                rendimiento_flota = Calculos.Dividir(conRend.Sum(f => f.km_consumidos ?? 0), conRend.Sum(f => f.galones)),
                promedio_diario = PorDia(totalKm, diasContados)
            },
            unidades = filas.Select(f => new
            {
                f.id_unidad,
                f.placa,
                f.numero_bus,
                f.tipo,
                f.activo,
                f.km_periodo,
                f.km_fuente,
                f.galones,
                f.vales,
                f.rendimiento,
                f.km_acumulado,
                f.promedio_diario
            })
        });
    }

    private record FilaReporte(int id_unidad, string placa, string? numero_bus, string tipo, bool activo, int km_periodo,
        string? km_fuente, decimal galones, int vales, decimal? rendimiento, int km_acumulado, decimal? promedio_diario,
        int? km_consumidos);

    private static decimal? PorDia(int km, int dias)
        => dias > 0 ? Math.Round((decimal)km / dias, 2, MidpointRounding.AwayFromZero) : null;

    /// <summary>Periodo [inicio, fin] (fin inclusive) a partir de mes o desde/hasta. Sin parámetros: mes actual.</summary>
    private static (DateTime inicio, DateTime fin) Periodo(string? mes, DateTime? desde, DateTime? hasta, DateTime hoy)
    {
        DateTime inicio, fin;
        if (!string.IsNullOrWhiteSpace(mes))
        {
            if (desde is not null || hasta is not null)
                throw new ReglaException("Use 'mes' o 'desde' y 'hasta', no ambos.");
            if (!DateTime.TryParseExact(mes.Trim(), "yyyy-MM", System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var m))
                throw new ReglaException("El mes debe tener el formato yyyy-MM (por ejemplo 2026-11).");
            inicio = m;
            fin = m.AddMonths(1).AddDays(-1);
        }
        else if (desde is not null || hasta is not null)
        {
            if (desde is null || hasta is null)
                throw new ReglaException("Indique 'desde' y 'hasta' (yyyy-MM-dd).");
            inicio = desde.Value.Date;
            fin = hasta.Value.Date;
            if (fin < inicio) throw new ReglaException("La fecha 'hasta' no puede ser anterior a 'desde'.");
            if ((fin - inicio).Days > 731) throw new ReglaException("El periodo no puede superar los dos años.");
        }
        else
        {
            inicio = new DateTime(hoy.Year, hoy.Month, 1);
            fin = inicio.AddMonths(1).AddDays(-1);
        }
        if (inicio.Year < 2000) throw new ReglaException("El periodo no es válido.", "V-06");
        if (inicio > hoy) throw new ReglaException("El periodo aún no empieza.", "V-06");
        return (inicio, fin);
    }

    /// <summary>Días entre inicio y fin (inclusive). Hábiles = lunes a viernes (no hay tabla de feriados).</summary>
    internal static int ContarDias(DateTime inicio, DateTime fin, bool habiles)
    {
        if (fin < inicio) return 0;
        if (!habiles) return (fin - inicio).Days + 1;
        var n = 0;
        for (var d = inicio; d <= fin; d = d.AddDays(1))
            if (d.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday) n++;
        return n;
    }
}
