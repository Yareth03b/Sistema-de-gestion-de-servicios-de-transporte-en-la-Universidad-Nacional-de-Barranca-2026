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
        var list = await _db.Mantenimientos
            .Join(_db.Unidades, m => m.id_unidad, u => u.id_unidad, (m, u) => new
            {
                m.id_mantenimiento,
                m.id_unidad,
                placa = u.placa,
                fecha = m.fecha.ToString("yyyy-MM-dd"),
                m.km,
                m.tipo,
                m.detalle,
                m.foto
            })
            .OrderByDescending(m => m.fecha)
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
