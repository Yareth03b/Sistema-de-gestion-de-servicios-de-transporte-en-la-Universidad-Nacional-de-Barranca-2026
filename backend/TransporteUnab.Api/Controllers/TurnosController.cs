using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TurnosController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public TurnosController(TransporteDbContext db) => _db = db;

    public record TurnoDto(int id_unidad, int id_conductor, int id_ruta, DateTime fecha, string hora_salida, string hora_llegada, int km_inicial, int km_final, string? observaciones);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var list = await _db.BitacoraTurnos
            .Include(t => t.Unidad)
            .Include(t => t.Conductor)
            .OrderByDescending(t => t.fecha).ThenByDescending(t => t.id_turno)
            .Select(t => new
            {
                t.id_turno,
                t.id_unidad,
                t.id_conductor,
                placa = t.Unidad!.placa,
                conductor = t.Conductor!.nombres + " " + t.Conductor.apellidos,
                fecha = t.fecha.ToString("yyyy-MM-dd"),
                hora_salida = t.hora_salida.ToString(@"hh\:mm"),
                hora_llegada = t.hora_llegada.ToString(@"hh\:mm"),
                t.km_inicial,
                t.km_final,
                t.km_recorridos,
                t.observaciones,
                ruta_texto = _db.TurnoRutas
                    .Where(tr => tr.id_turno == t.id_turno)
                    .Select(tr => tr.Ruta!.punto_salida + " ↔ " + tr.Ruta.punto_llegada)
                    .FirstOrDefault() ?? "-"
            })
            .ToListAsync();

        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TurnoDto dto)
    {
        if (dto.km_final <= dto.km_inicial)
            return BadRequest(new { message = "El kilometraje final debe ser mayor al inicial." });

        var turno = new BitacoraTurno
        {
            id_unidad = dto.id_unidad,
            id_conductor = dto.id_conductor,
            fecha = dto.fecha,
            hora_salida = TimeSpan.Parse(dto.hora_salida),
            hora_llegada = TimeSpan.Parse(dto.hora_llegada),
            km_inicial = dto.km_inicial,
            km_final = dto.km_final,
            observaciones = dto.observaciones
        };
        _db.BitacoraTurnos.Add(turno);
        await _db.SaveChangesAsync();

        if (dto.id_ruta > 0)
        {
            _db.TurnoRutas.Add(new TurnoRuta { id_turno = turno.id_turno, id_ruta = dto.id_ruta });
            await _db.SaveChangesAsync();
        }
        return Ok(turno);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] TurnoDto dto)
    {
        if (dto.km_final <= dto.km_inicial)
            return BadRequest(new { message = "El kilometraje final debe ser mayor al inicial." });

        var turno = await _db.BitacoraTurnos.FindAsync(id);
        if (turno is null) return NotFound();

        turno.id_unidad = dto.id_unidad;
        turno.id_conductor = dto.id_conductor;
        turno.fecha = dto.fecha;
        turno.hora_salida = TimeSpan.Parse(dto.hora_salida);
        turno.hora_llegada = TimeSpan.Parse(dto.hora_llegada);
        turno.km_inicial = dto.km_inicial;
        turno.km_final = dto.km_final;
        turno.observaciones = dto.observaciones;
        await _db.SaveChangesAsync();
        return Ok(turno);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var turno = await _db.BitacoraTurnos.FindAsync(id);
        if (turno is null) return NotFound();
        var trs = _db.TurnoRutas.Where(x => x.id_turno == id);
        _db.TurnoRutas.RemoveRange(trs);
        _db.BitacoraTurnos.Remove(turno);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
