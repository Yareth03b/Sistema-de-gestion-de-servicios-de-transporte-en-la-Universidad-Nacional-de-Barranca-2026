using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EstimacionController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public EstimacionController(TransporteDbContext db) => _db = db;

    /// <summary>
    /// distancia_km = distancia total del viaje (ida y vuelta), tal como la envía la web.
    /// costo_estimado se recalcula en el servidor; el valor enviado se ignora.
    /// </summary>
    public record EstimacionDto(int id_unidad, DateTime fecha, string destino, int distancia_km,
        decimal rendimiento_promedio, decimal precio_galon, decimal? costo_estimado = null);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var list = await _db.EstimacionesViaje.AsNoTracking()
            .OrderByDescending(e => e.fecha).ThenByDescending(e => e.id_estimacion)
            .ToListAsync();
        return Ok(list.Select(e => new
        {
            e.id_estimacion,
            e.id_unidad,
            fecha = e.fecha.ToString("yyyy-MM-dd"),
            e.destino,
            e.distancia_km,
            e.rendimiento_promedio,
            e.precio_galon,
            e.costo_estimado
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] EstimacionDto dto)
    {
        var unidad = await Reglas.UnidadExistente(_db, dto.id_unidad);
        Reglas.SoloBuses(unidad, "El estimador de viajes");
        if (dto.distancia_km <= 0) throw new ReglaException("La distancia debe ser mayor a 0 km.");
        var rendimiento = Math.Round(dto.rendimiento_promedio, 2, MidpointRounding.AwayFromZero);
        var precio = Math.Round(dto.precio_galon, 2, MidpointRounding.AwayFromZero);
        // Protección contra división entre cero.
        if (rendimiento <= 0) throw new ReglaException("El rendimiento promedio debe ser mayor a 0 km/gal.");
        if (precio <= 0) throw new ReglaException("El precio por galón debe ser mayor a 0.");
        if (dto.rendimiento_promedio > 999_999.99m || dto.precio_galon > 999_999.99m)
            throw new ReglaException("El rendimiento o el precio son demasiado grandes.");

        // Costo estimado = (distancia ida y vuelta ÷ rendimiento promedio) × precio por galón.
        var costo = Math.Round(dto.distancia_km / rendimiento * precio, 2, MidpointRounding.AwayFromZero);
        if (costo > 99_999_999.99m) throw new ReglaException("El costo estimado es demasiado grande.");

        var e = new EstimacionViaje
        {
            id_unidad = dto.id_unidad,
            fecha = dto.fecha.Date,
            destino = Reglas.Requerido(dto.destino, "destino", 100),
            distancia_km = dto.distancia_km,
            rendimiento_promedio = rendimiento,
            precio_galon = precio,
            costo_estimado = costo
        };
        _db.EstimacionesViaje.Add(e);
        await _db.SaveChangesAsync();
        return Ok(e);
    }
}
