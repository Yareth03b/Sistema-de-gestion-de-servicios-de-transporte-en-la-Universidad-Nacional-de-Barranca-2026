using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

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
        var cierres = await _db.CierresTrimestrales
            .OrderByDescending(c => c.anio).ThenByDescending(c => c.trimestre)
            .ToListAsync();

        var result = new List<object>();
        foreach (var c in cierres)
        {
            var unidades = await _db.CierresUnidad
                .Where(cu => cu.id_cierre == c.id_cierre)
                .Join(_db.Unidades, cu => cu.id_unidad, u => u.id_unidad, (cu, u) => new
                {
                    cu.id_unidad,
                    u.placa,
                    cu.km_recorridos,
                    cu.galones,
                    cu.rendimiento,
                    cu.km_acumulado
                })
                .ToListAsync();

            result.Add(new
            {
                c.id_cierre,
                c.anio,
                c.trimestre,
                fecha_cierre = c.fecha_cierre.ToString("yyyy-MM-dd"),
                unidades
            });
        }
        return Ok(result);
    }

    [HttpPost("cerrar-trimestre")]
    public async Task<IActionResult> CerrarTrimestre([FromBody] CierreRequest req)
    {
        if (await _db.CierresTrimestrales.AnyAsync(c => c.anio == req.anio && c.trimestre == req.trimestre))
            return BadRequest(new { message = $"El trimestre {req.trimestre} de {req.anio} ya fue cerrado." });

        var cierre = new CierreTrimestral
        {
            anio = req.anio,
            trimestre = req.trimestre,
            fecha_cierre = DateTime.Today
        };
        _db.CierresTrimestrales.Add(cierre);
        await _db.SaveChangesAsync();

        var buses = await _db.Unidades.Where(u => u.activo && u.tipo == "Bus").ToListAsync();
        foreach (var bus in buses)
        {
            var kmRec = await _db.BitacoraTurnos
                .Where(t => t.id_unidad == bus.id_unidad)
                .SumAsync(t => (int?)(t.km_final - t.km_inicial)) ?? 0;
            var gal = await _db.Abastecimientos
                .Where(a => a.id_unidad == bus.id_unidad)
                .SumAsync(a => (decimal?)a.galones) ?? 0m;
            var kmAcum = await _db.BitacoraTurnos
                .Where(t => t.id_unidad == bus.id_unidad)
                .MaxAsync(t => (int?)t.km_final) ?? 0;

            _db.CierresUnidad.Add(new CierreUnidad
            {
                id_cierre = cierre.id_cierre,
                id_unidad = bus.id_unidad,
                km_recorridos = kmRec,
                galones = gal,
                rendimiento = gal > 0 ? Math.Round(kmRec / gal, 2) : 0m,
                km_acumulado = kmAcum
            });
        }
        await _db.SaveChangesAsync();
        return Ok(cierre);
    }
}
