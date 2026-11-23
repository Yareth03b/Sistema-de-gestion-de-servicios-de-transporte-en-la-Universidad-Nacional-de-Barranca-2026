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

    /// <summary>
    /// Renombra un área. Los vales y las solicitudes apuntan a id_area, así que no se tocan.
    /// La BD no tiene UNIQUE sobre nombre: la unicidad (sin distinguir mayúsculas) se valida aquí.
    /// </summary>
    [HttpPut("areas/{id:int}")]
    public async Task<IActionResult> UpdateArea(int id, [FromBody] AreaDto dto)
    {
        var area = await BuscarArea(id);
        var nombre = Reglas.Requerido(dto.nombre, "nombre", 100);
        var minusculas = nombre.ToLower();
        if (await _db.Areas.AnyAsync(a => a.id_area != id && a.nombre.ToLower() == minusculas))
            throw ReglaException.Conflicto($"Ya existe otra área con el nombre '{nombre}'.");
        area.nombre = nombre;
        await _db.SaveChangesAsync();
        return Ok(area);
    }

    /// <summary>
    /// Borra un área sin uso. Si algún vale (Abastecimiento.id_area) o alguna solicitud (SolicitudViaje.id_area)
    /// la usa, responde 409 V-11 con el conteo. El mapeo de FK de Errores.cs queda como red de seguridad.
    /// </summary>
    [HttpDelete("areas/{id:int}")]
    public async Task<IActionResult> DeleteArea(int id)
    {
        var area = await BuscarArea(id);
        var vales = await _db.Abastecimientos.CountAsync(a => a.id_area == id);
        var solicitudes = await _db.SolicitudesViaje.CountAsync(s => s.id_area == id);
        if (vales + solicitudes > 0)
        {
            var partes = new List<string>();
            if (vales > 0) partes.Add(vales == 1 ? "1 vale" : $"{vales} vales");
            if (solicitudes > 0) partes.Add(solicitudes == 1 ? "1 solicitud" : $"{solicitudes} solicitudes");
            throw ReglaException.Conflicto(
                $"No se puede borrar: el área '{area.nombre}' tiene {string.Join(" y ", partes)}.", "V-11");
        }

        _db.Areas.Remove(area);
        await _db.SaveChangesAsync();
        return Ok(new { message = $"Área '{area.nombre}' borrada." });
    }

    private async Task<AreaSolicitante> BuscarArea(int id)
        => await _db.Areas.FirstOrDefaultAsync(a => a.id_area == id)
           ?? throw ReglaException.NoEncontrado($"El área {id} no existe.");
}
