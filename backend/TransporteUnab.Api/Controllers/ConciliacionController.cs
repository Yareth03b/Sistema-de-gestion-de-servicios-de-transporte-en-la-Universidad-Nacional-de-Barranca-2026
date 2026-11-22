using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ConciliacionController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public ConciliacionController(TransporteDbContext db) => _db = db;

    public record ReporteGrifoDto(short anio, byte trimestre, decimal galones_total, string? observaciones);

    /// <summary>
    /// HU-16: total del grifo del trimestre (digitado) frente a la suma de los vales
    /// de TODAS las unidades en ese mismo trimestre.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var reportes = await _db.ReportesGrifo.AsNoTracking()
            .OrderByDescending(r => r.anio).ThenByDescending(r => r.trimestre)
            .ToListAsync();

        var resultado = new List<object>();
        foreach (var r in reportes)
        {
            var sistema = await GalonesSistema(r.anio, r.trimestre);
            resultado.Add(new
            {
                r.id_reporte,
                r.anio,
                r.trimestre,
                r.galones_total,
                r.observaciones,
                galones_sistema = sistema,
                diferencia = r.galones_total - sistema
            });
        }
        return Ok(resultado);
    }

    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] ReporteGrifoDto dto)
    {
        if (dto.trimestre is < 1 or > 4) throw new ReglaException("El trimestre debe estar entre 1 y 4.");
        if (dto.anio < 2000 || dto.anio > HoraPeru.Hoy.Year)
            throw new ReglaException("El año no es válido.", "V-06");
        if (Calculos.RangoTrimestre(dto.anio, dto.trimestre).inicio > HoraPeru.Hoy)
            throw new ReglaException("No se puede registrar el reporte de un trimestre futuro.", "V-06");
        if (dto.galones_total < 0 || dto.galones_total > 99_999_999.99m)
            throw new ReglaException("El total de galones del grifo no es válido.");
        var observaciones = Reglas.Opcional(dto.observaciones, "observaciones", 300);

        var reporte = await _db.ReportesGrifo.FirstOrDefaultAsync(r => r.anio == dto.anio && r.trimestre == dto.trimestre);
        if (reporte is null)
        {
            reporte = new ReporteGrifo { anio = dto.anio, trimestre = dto.trimestre };
            _db.ReportesGrifo.Add(reporte);
        }
        reporte.galones_total = Math.Round(dto.galones_total, 2, MidpointRounding.AwayFromZero);
        reporte.observaciones = observaciones;
        await _db.SaveChangesAsync();

        // Antes devolvía el DTO recibido (id_reporte = 0 al actualizar).
        return Ok(reporte);
    }

    /// <summary>
    /// Detalle de un trimestre (panel 12, conciliación TRIMESTRAL, D1): por unidad, cantidad de vales,
    /// números de vale y galones según los vales registrados, frente al total del grifo si ya se guardó.
    /// </summary>
    [HttpGet("detalle")]
    public async Task<IActionResult> Detalle([FromQuery] short anio, [FromQuery] byte trimestre)
    {
        if (trimestre is < 1 or > 4) throw new ReglaException("El trimestre debe estar entre 1 y 4.");
        if (anio < 2000 || anio > 2100) throw new ReglaException("El año no es válido.");
        var (inicio, fin) = Calculos.RangoTrimestre(anio, trimestre);

        var vales = await _db.Abastecimientos.AsNoTracking()
            .Where(a => a.fecha >= inicio && a.fecha < fin)
            .Join(_db.Unidades, a => a.id_unidad, u => u.id_unidad, (a, u) => new
            {
                a.id_unidad,
                u.placa,
                a.nro_vale,
                a.fecha,
                a.galones
            })
            .OrderBy(v => v.placa).ThenBy(v => v.fecha).ThenBy(v => v.nro_vale)
            .ToListAsync();

        var reporte = await _db.ReportesGrifo.AsNoTracking()
            .FirstOrDefaultAsync(r => r.anio == anio && r.trimestre == trimestre);
        var sistema = vales.Sum(v => v.galones);

        return Ok(new
        {
            anio,
            trimestre,
            desde = inicio.ToString("yyyy-MM-dd"),
            hasta = fin.AddDays(-1).ToString("yyyy-MM-dd"),
            reporte = reporte is null ? null : new { reporte.id_reporte, reporte.galones_total, reporte.observaciones },
            galones_sistema = sistema,
            cantidad_vales = vales.Count,
            diferencia = reporte is null ? (decimal?)null : reporte.galones_total - sistema,
            unidades = vales.GroupBy(v => new { v.id_unidad, v.placa }).Select(g => new
            {
                g.Key.id_unidad,
                g.Key.placa,
                numero_bus = Reglas.NumeroBus(g.Key.placa),
                cantidad_vales = g.Count(),
                nros_vale = g.Select(v => v.nro_vale).ToArray(),
                galones = g.Sum(v => v.galones),
                vales = g.Select(v => new { v.nro_vale, fecha = v.fecha.ToString("yyyy-MM-dd"), v.galones })
            })
        });
    }

    private async Task<decimal> GalonesSistema(int anio, int trimestre)
    {
        var (inicio, fin) = Calculos.RangoTrimestre(anio, trimestre);
        return await _db.Abastecimientos
            .Where(a => a.fecha >= inicio && a.fecha < fin)
            .SumAsync(a => (decimal?)a.galones) ?? 0m;
    }
}
