using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RutasController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public RutasController(TransporteDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var rutas = await _db.Rutas.ToListAsync();
        var areas = await _db.Areas.Select(a => new
        {
            a.id_area,
            a.nombre,
            vales = _db.Abastecimientos.Count(ab => ab.id_area == a.id_area),
            galones = _db.Abastecimientos.Where(ab => ab.id_area == a.id_area).Sum(ab => (decimal?)ab.galones) ?? 0m
        }).ToListAsync();

        return Ok(new { rutas, areas });
    }

    [HttpPost]
    public async Task<IActionResult> CreateRuta([FromBody] Ruta dto)
    {
        _db.Rutas.Add(dto);
        await _db.SaveChangesAsync();
        return Ok(dto);
    }

    [HttpPost("areas")]
    public async Task<IActionResult> CreateArea([FromBody] AreaSolicitante dto)
    {
        _db.Areas.Add(dto);
        await _db.SaveChangesAsync();
        return Ok(dto);
    }
}
