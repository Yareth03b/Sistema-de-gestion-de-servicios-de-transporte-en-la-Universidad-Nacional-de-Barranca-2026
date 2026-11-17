using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ConductoresController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public ConductoresController(TransporteDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var list = await _db.Conductores
            .Include(c => c.Unidad)
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
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Conductor dto)
    {
        if (!Regex.IsMatch(dto.dni, @"^\d{8}$"))
            return BadRequest(new { message = "El DNI debe tener exactamente 8 dígitos numéricos." });
        if (await _db.Conductores.AnyAsync(c => c.dni == dto.dni))
            return BadRequest(new { message = $"Ya existe un conductor con DNI {dto.dni}." });

        dto.activo = true;
        _db.Conductores.Add(dto);
        await _db.SaveChangesAsync();
        return Ok(dto);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] Conductor dto)
    {
        if (!Regex.IsMatch(dto.dni, @"^\d{8}$"))
            return BadRequest(new { message = "El DNI debe tener exactamente 8 dígitos numéricos." });

        var c = await _db.Conductores.FindAsync(id);
        if (c is null) return NotFound();
        c.id_unidad = dto.id_unidad;
        c.dni = dto.dni;
        c.nombres = dto.nombres;
        c.apellidos = dto.apellidos;
        c.brevete = dto.brevete;
        await _db.SaveChangesAsync();
        return Ok(c);
    }
}
