using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MantenimientoController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public MantenimientoController(TransporteDbContext db) => _db = db;

    public record MantenimientoDto(int id_unidad, DateTime fecha, int km, string tipo, string? detalle, string? foto);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        // Antes: OrderBy sobre fecha.ToString(...) dentro de la consulta → EF no lo traduce → HTTP 500.
        var list = await _db.Mantenimientos.AsNoTracking()
            .Join(_db.Unidades, m => m.id_unidad, u => u.id_unidad, (m, u) => new
            {
                m.id_mantenimiento,
                m.id_unidad,
                u.placa,
                m.fecha,
                m.km,
                m.tipo,
                m.detalle,
                m.foto
            })
            .OrderByDescending(m => m.fecha).ThenByDescending(m => m.km)
            .ToListAsync();

        return Ok(list.Select(m => new
        {
            m.id_mantenimiento,
            m.id_unidad,
            m.placa,
            fecha = m.fecha.ToString("yyyy-MM-dd"),
            m.km,
            m.tipo,
            m.detalle,
            m.foto
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] MantenimientoDto dto)
    {
        var unidad = await Reglas.UnidadExistente(_db, dto.id_unidad);
        Reglas.SoloBuses(unidad, "El mantenimiento"); // S-01
        Reglas.V06FechaNoFutura(dto.fecha);
        if (dto.km < 0) throw new ReglaException("El kilometraje no puede ser negativo.");

        var tipo = Reglas.Requerido(dto.tipo, "tipo", 20);
        var tipoNormal = Reglas.TiposMantenimiento.FirstOrDefault(t => t.Equals(tipo, StringComparison.OrdinalIgnoreCase))
            ?? throw new ReglaException($"Tipo de mantenimiento no válido. Use: {string.Join(", ", Reglas.TiposMantenimiento)}.");

        var m = new Mantenimiento
        {
            id_unidad = dto.id_unidad,
            fecha = dto.fecha.Date,
            km = dto.km,
            tipo = tipoNormal,
            detalle = Reglas.Opcional(dto.detalle, "detalle", 300),
            foto = Reglas.Opcional(dto.foto, "foto", 260)
        };
        _db.Mantenimientos.Add(m);
        await _db.SaveChangesAsync();
        return Ok(m);
    }
}
