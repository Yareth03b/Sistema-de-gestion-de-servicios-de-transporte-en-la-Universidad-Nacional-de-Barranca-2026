using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EstimacionController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public EstimacionController(TransporteDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var list = await _db.EstimacionesViaje
            .OrderByDescending(e => e.fecha).ThenByDescending(e => e.id_estimacion)
            .Select(e => new
            {
                e.id_estimacion,
                e.id_unidad,
                fecha = e.fecha.ToString("yyyy-MM-dd"),
                e.destino,
                e.distancia_km,
                e.rendimiento_promedio,
                e.precio_galon,
                e.costo_estimado
            })
            .ToListAsync();
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] EstimacionViaje dto)
    {
        dto.costo_estimado = dto.rendimiento_promedio > 0
            ? Math.Round((dto.distancia_km / dto.rendimiento_promedio) * dto.precio_galon, 2)
            : 0m;
        _db.EstimacionesViaje.Add(dto);
        await _db.SaveChangesAsync();
        return Ok(dto);
    }
}
