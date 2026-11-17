using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CombustibleController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public CombustibleController(TransporteDbContext db) => _db = db;

    public record AbastecimientoDto(int id_unidad, int id_conductor, int? id_area, string nro_vale, DateTime fecha, int km_actual, decimal galones, string tipo_combustible, string? observaciones);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var items = await _db.Abastecimientos
            .Include(a => a.Unidad)
            .Include(a => a.Conductor)
            .Include(a => a.Area)
            .OrderByDescending(a => a.fecha).ThenByDescending(a => a.id_abastecimiento)
            .Select(a => new
            {
                a.id_abastecimiento,
                a.id_unidad,
                a.id_conductor,
                a.id_area,
                a.nro_vale,
                fecha = a.fecha.ToString("yyyy-MM-dd"),
                placa = a.Unidad!.placa,
                conductor = a.Conductor!.nombres + " " + a.Conductor.apellidos,
                area_nombre = a.Area != null ? a.Area.nombre : "-",
                a.km_actual,
                a.galones,
                a.tipo_combustible,
                a.observaciones,
                km_consumidos = 0,
                rendimiento = 0m
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AbastecimientoDto dto)
    {
        if (dto.galones <= 0)
            return BadRequest(new { message = "La cantidad de galones debe ser mayor a 0." });

        if (await _db.Abastecimientos.AnyAsync(a => a.nro_vale == dto.nro_vale))
            return BadRequest(new { message = $"El número de vale {dto.nro_vale} ya existe." });

        var entity = new Abastecimiento
        {
            id_unidad = dto.id_unidad,
            id_conductor = dto.id_conductor,
            id_area = dto.id_area,
            nro_vale = dto.nro_vale,
            fecha = dto.fecha,
            km_actual = dto.km_actual,
            galones = dto.galones,
            tipo_combustible = dto.tipo_combustible,
            observaciones = dto.observaciones
        };
        _db.Abastecimientos.Add(entity);
        await _db.SaveChangesAsync();
        return Ok(entity);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] AbastecimientoDto dto)
    {
        if (dto.galones <= 0)
            return BadRequest(new { message = "La cantidad de galones debe ser mayor a 0." });

        var entity = await _db.Abastecimientos.FindAsync(id);
        if (entity is null) return NotFound();

        entity.id_unidad = dto.id_unidad;
        entity.id_conductor = dto.id_conductor;
        entity.id_area = dto.id_area;
        entity.nro_vale = dto.nro_vale;
        entity.fecha = dto.fecha;
        entity.km_actual = dto.km_actual;
        entity.galones = dto.galones;
        entity.tipo_combustible = dto.tipo_combustible;
        entity.observaciones = dto.observaciones;
        await _db.SaveChangesAsync();
        return Ok(entity);
    }
}
