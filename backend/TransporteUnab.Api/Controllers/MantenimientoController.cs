using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MantenimientoController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public MantenimientoController(TransporteDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        // Se ordena por la fecha real antes de proyectar: EF Core no traduce a SQL
        // un OrderBy sobre fecha.ToString("yyyy-MM-dd") y la consulta daba 500.
        var list = await _db.Mantenimientos
            .Join(_db.Unidades, m => m.id_unidad, u => u.id_unidad, (m, u) => new { m, u })
            .OrderByDescending(x => x.m.fecha)
            .Select(x => new
            {
                x.m.id_mantenimiento,
                x.m.id_unidad,
                placa = x.u.placa,
                fecha = x.m.fecha.ToString("yyyy-MM-dd"),
                x.m.km,
                x.m.tipo,
                x.m.detalle,
                x.m.foto
            })
            .ToListAsync();
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Mantenimiento dto)
    {
        _db.Mantenimientos.Add(dto);
        await _db.SaveChangesAsync();
        return Ok(dto);
    }
}
