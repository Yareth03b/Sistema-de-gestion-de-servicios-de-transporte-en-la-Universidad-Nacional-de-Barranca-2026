using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RutasController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public RutasController(TransporteDbContext db) => _db = db;

    public record RutaDto(string punto_salida, string punto_llegada, int km_referencia);
    public record AreaDto(string nombre);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var rutas = await _db.Rutas.AsNoTracking()
            .OrderBy(r => r.punto_salida).ThenBy(r => r.punto_llegada).ToListAsync();
        var areas = await _db.Areas.AsNoTracking()
            .OrderBy(a => a.nombre)
            .Select(a => new
            {
                a.id_area,
                a.nombre,
                vales = _db.Abastecimientos.Count(ab => ab.id_area == a.id_area),
                galones = _db.Abastecimientos.Where(ab => ab.id_area == a.id_area).Sum(ab => (decimal?)ab.galones) ?? 0m
            }).ToListAsync();

        return Ok(new { rutas, areas });
    }

    [HttpPost]
    public async Task<IActionResult> CreateRuta([FromBody] RutaDto dto)
    {
        if (dto.km_referencia <= 0)
            throw new ReglaException("Los km de referencia deben ser mayores a 0.");
        var ruta = new Ruta
        {
            punto_salida = Reglas.Requerido(dto.punto_salida, "punto_salida", 100),
            punto_llegada = Reglas.Requerido(dto.punto_llegada, "punto_llegada", 100),
            km_referencia = dto.km_referencia
        };
        _db.Rutas.Add(ruta);
        await _db.SaveChangesAsync();
        return Ok(ruta);
    }

    [HttpPost("areas")]
    public async Task<IActionResult> CreateArea([FromBody] AreaDto dto)
    {
        var nombre = Reglas.Requerido(dto.nombre, "nombre", 100);
        if (await _db.Areas.AnyAsync(a => a.nombre == nombre))
            throw ReglaException.Conflicto($"El área '{nombre}' ya existe.");
        var area = new AreaSolicitante { nombre = nombre };
        _db.Areas.Add(area);
        await _db.SaveChangesAsync();
        return Ok(area);
    }
}
