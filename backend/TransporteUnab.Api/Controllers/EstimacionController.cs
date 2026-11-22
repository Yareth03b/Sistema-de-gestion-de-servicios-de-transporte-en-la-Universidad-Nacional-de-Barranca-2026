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
    /// id_solicitud (opcional): solicitud de viaje que se está estimando.
    /// </summary>
    public record EstimacionDto(int id_unidad, DateTime fecha, string destino, int distancia_km,
        decimal rendimiento_promedio, decimal precio_galon, decimal? costo_estimado = null, int? id_solicitud = null);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var list = await _db.EstimacionesViaje.AsNoTracking()
            .OrderByDescending(e => e.fecha).ThenByDescending(e => e.id_estimacion)
            .Select(e => new
            {
                e,
                solicitud = _db.SolicitudesViaje.Where(s => s.id_solicitud == e.id_solicitud)
                    .Select(s => new
                    {
                        s.codigo,
                        area_nombre = _db.Areas.Where(a => a.id_area == s.id_area).Select(a => a.nombre).FirstOrDefault()
                    })
                    .FirstOrDefault()
            })
            .ToListAsync();
        return Ok(list.Select(x => new
        {
            x.e.id_estimacion,
            x.e.id_unidad,
            fecha = x.e.fecha.ToString("yyyy-MM-dd"),
            x.e.destino,
            x.e.distancia_km,
            x.e.rendimiento_promedio,
            x.e.precio_galon,
            x.e.costo_estimado,
            x.e.id_solicitud,
            codigo_solicitud = x.solicitud?.codigo,
            area_nombre = x.solicitud?.area_nombre
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

        // id_solicitud opcional (0 o null = sin solicitud). Si la solicitud estaba «Pendiente», pasa a «Estimada»
        // en el mismo SaveChanges que la estimación (una sola transacción).
        SolicitudViaje? solicitud = null;
        if (dto.id_solicitud is > 0)
        {
            solicitud = await _db.SolicitudesViaje.FirstOrDefaultAsync(s => s.id_solicitud == dto.id_solicitud)
                        ?? throw new ReglaException($"La solicitud {dto.id_solicitud} no existe.");
            if (solicitud.estado == Reglas.EstadosSolicitud[0]) solicitud.estado = "Estimada";
        }

        var e = new EstimacionViaje
        {
            id_unidad = dto.id_unidad,
            id_solicitud = solicitud?.id_solicitud,
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
