using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ConciliacionController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public ConciliacionController(TransporteDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var reportes = await _db.ReportesGrifo
            .OrderByDescending(r => r.anio).ThenByDescending(r => r.trimestre)
            .ToListAsync();

        var totalSistema = await _db.Abastecimientos.SumAsync(a => (decimal?)a.galones) ?? 0m;
        return Ok(reportes.Select(r => new
        {
            r.id_reporte,
            r.anio,
            r.trimestre,
            r.galones_total,
            r.observaciones,
            galones_sistema = totalSistema
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] ReporteGrifo dto)
    {
        var existing = await _db.ReportesGrifo.FirstOrDefaultAsync(r => r.anio == dto.anio && r.trimestre == dto.trimestre);
        if (existing is not null)
        {
            existing.galones_total = dto.galones_total;
            existing.observaciones = dto.observaciones;
        }
        else
        {
            _db.ReportesGrifo.Add(dto);
        }
        await _db.SaveChangesAsync();
        return Ok(dto);
    }
}
