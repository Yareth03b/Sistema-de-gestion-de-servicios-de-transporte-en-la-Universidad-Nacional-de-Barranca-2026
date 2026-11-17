using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UnidadesController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public UnidadesController(TransporteDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var list = await _db.Unidades
            .Where(u => u.activo)
            .Select(u => new
            {
                u.id_unidad,
                u.placa,
                u.tipo,
                u.marca,
                u.modelo,
                u.codigo_patrimonial,
                u.capacidad,
                u.estado,
                u.activo,
                km_actual = _db.BitacoraTurnos
                    .Where(t => t.id_unidad == u.id_unidad)
                    .Max(t => (int?)t.km_final) ?? 0
            })
            .ToListAsync();
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UnidadTransporte dto)
    {
        if (await _db.Unidades.AnyAsync(u => u.placa == dto.placa))
            return BadRequest(new { message = $"La placa {dto.placa} ya está registrada." });
        dto.activo = true;
        _db.Unidades.Add(dto);
        await _db.SaveChangesAsync();
        return Ok(dto);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UnidadTransporte dto)
    {
        var u = await _db.Unidades.FindAsync(id);
        if (u is null) return NotFound();
        u.placa = dto.placa;
        u.tipo = dto.tipo;
        u.marca = dto.marca;
        u.modelo = dto.modelo;
        u.codigo_patrimonial = dto.codigo_patrimonial;
        u.capacidad = dto.capacidad;
        u.estado = dto.estado;
        await _db.SaveChangesAsync();
        return Ok(u);
    }

    [HttpGet("{id:int}/historial")]
    public async Task<IActionResult> Historial(int id)
    {
        var unidad = await _db.Unidades.FindAsync(id);
        if (unidad is null) return NotFound();
        return Ok(new
        {
            unidad,
            turnos = await _db.BitacoraTurnos.Where(t => t.id_unidad == id).OrderByDescending(t => t.fecha).ToListAsync(),
            abastecimientos = await _db.Abastecimientos.Where(a => a.id_unidad == id).OrderByDescending(a => a.fecha).ToListAsync(),
            mantenimientos = await _db.Mantenimientos.Where(m => m.id_unidad == id).OrderByDescending(m => m.fecha).ToListAsync(),
            documentos = await _db.DocumentosUnidad.Where(d => d.id_unidad == id).ToListAsync(),
            incidentes = await _db.Incidentes.Where(i => i.id_unidad == id).OrderByDescending(i => i.fecha).ToListAsync()
        });
    }

    [HttpPost("documentos")]
    public async Task<IActionResult> AddDocumento([FromBody] DocumentoUnidad doc)
    {
        _db.DocumentosUnidad.Add(doc);
        await _db.SaveChangesAsync();
        return Ok(doc);
    }

    [HttpPost("incidentes")]
    public async Task<IActionResult> AddIncidente([FromBody] Incidente inc)
    {
        _db.Incidentes.Add(inc);
        await _db.SaveChangesAsync();
        return Ok(inc);
    }

    [HttpPut("incidentes/{id:int}")]
    public async Task<IActionResult> UpdateIncidente(int id, [FromBody] Incidente dto)
    {
        var inc = await _db.Incidentes.FindAsync(id);
        if (inc is null) return NotFound();
        inc.fecha = dto.fecha;
        inc.descripcion = dto.descripcion;
        await _db.SaveChangesAsync();
        return Ok(inc);
    }
}
