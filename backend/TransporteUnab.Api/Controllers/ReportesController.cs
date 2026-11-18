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
}
