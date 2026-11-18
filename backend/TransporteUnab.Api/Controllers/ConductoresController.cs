using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ConductoresController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public ConductoresController(TransporteDbContext db) => _db = db;

    public record ConductorDto(int? id_unidad, string dni, string nombres, string apellidos, string? brevete);

    /// <summary>Devuelve activos e inactivos (campo "activo"). ?solo_activos=true filtra los dados de baja.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool solo_activos = false)
    {
        var list = await _db.Conductores.AsNoTracking()
            .Where(c => !solo_activos || c.activo)
            .OrderBy(c => c.apellidos).ThenBy(c => c.nombres)
            .Select(c => new
            {
                c.id_conductor,
                c.id_unidad,
                c.dni,
                c.nombres,
                c.apellidos,
                c.brevete,
                c.activo,
                placa = c.Unidad != null ? c.Unidad.placa : "Sin asignar"
            })
            .ToListAsync();

        return Ok(list.Select(c => new
        {
            c.id_conductor,
            c.id_unidad,
            c.dni,
            c.nombres,
            c.apellidos,
            c.brevete,
            c.activo,
            c.placa,
            numero_bus = c.id_unidad is null ? null : Reglas.NumeroBus(c.placa)
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ConductorDto dto)
    {
        var c = new Conductor { activo = true };
        await Asignar(c, dto, null);
        _db.Conductores.Add(c);
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] ConductorDto dto)
    {
        var c = await Buscar(id);
        await Asignar(c, dto, id);
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    /// <summary>Baja lógica (V-11): activo = 0. Los conductores nunca se borran físicamente.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DarDeBaja(int id)
    {
        var c = await Buscar(id);
        c.activo = false;
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpPut("{id:int}/reactivar")]
    public async Task<IActionResult> Reactivar(int id)
    {
        var c = await Buscar(id);
        c.activo = true;
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    private async Task<Conductor> Buscar(int id)
        => await _db.Conductores.FindAsync(id) ?? throw ReglaException.NoEncontrado($"El conductor {id} no existe.");

    private async Task Asignar(Conductor c, ConductorDto dto, int? id)
    {
        var dni = Reglas.V08Dni(dto.dni);
        await Reglas.V07DniUnico(_db, dni, id);

        if (dto.id_unidad is int idUnidad && idUnidad > 0 && idUnidad != c.id_unidad)
        {
            var unidad = await Reglas.UnidadExistente(_db, idUnidad);
            // Decisión 2: solo los buses tienen conductores asignados.
            Reglas.SoloBuses(unidad, "La asignación de conductores");
            if (!unidad.activo)
                throw new ReglaException($"La unidad {unidad.placa} está dada de baja; no se le pueden asignar conductores.", "V-10");
        }

        c.dni = dni;
        c.nombres = Reglas.Requerido(dto.nombres, "nombres", 80);
        c.apellidos = Reglas.Requerido(dto.apellidos, "apellidos", 80);
        c.brevete = Reglas.Opcional(dto.brevete, "brevete", 15);
        c.id_unidad = dto.id_unidad is > 0 ? dto.id_unidad : null;
    }
}
