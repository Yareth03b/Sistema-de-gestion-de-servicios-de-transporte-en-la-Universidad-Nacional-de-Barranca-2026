using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
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

    /// <summary>fecha = ingreso al taller. fecha_salida opcional: null = el bus queda en taller.</summary>
    public record MantenimientoDto(int id_unidad, DateTime fecha, int km, string tipo, string? detalle, string? foto,
        DateTime? fecha_salida = null);

    /// <summary>Cuerpo de POST /salida (opcional) y PUT /salida (obligatorio).</summary>
    public record SalidaDto(DateTime? fecha_salida);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        // Antes: OrderBy sobre fecha.ToString(...) dentro de la consulta → EF no lo traduce → HTTP 500.
        var list = await _db.Mantenimientos.AsNoTracking()
            .Join(_db.Unidades, m => m.id_unidad, u => u.id_unidad, (m, u) => new { m, u.placa })
            .OrderByDescending(x => x.m.fecha).ThenByDescending(x => x.m.km).ThenByDescending(x => x.m.id_mantenimiento)
            .ToListAsync();

        return Ok(list.Select(x => Respuesta(x.m, x.placa)));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var m = await Buscar(id);
        var placa = await _db.Unidades.Where(u => u.id_unidad == m.id_unidad).Select(u => u.placa).FirstAsync();
        return Ok(Respuesta(m, placa));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] MantenimientoDto dto)
    {
        var unidad = await Reglas.UnidadExistente(_db, dto.id_unidad);
        Reglas.SoloBuses(unidad, "El mantenimiento"); // S-01
        Reglas.V06FechaNoFutura(dto.fecha, "fecha de ingreso");
        if (dto.km < 0) throw new ReglaException("El kilometraje no puede ser negativo.");

        var tipo = Reglas.Requerido(dto.tipo, "tipo", 20);
        var tipoNormal = Reglas.TiposMantenimiento.FirstOrDefault(t => t.Equals(tipo, StringComparison.OrdinalIgnoreCase))
            ?? throw new ReglaException($"Tipo de mantenimiento no válido. Use: {string.Join(", ", Reglas.TiposMantenimiento)}.");

        if (dto.fecha_salida is DateTime salida)
            ValidarSalida(dto.fecha.Date, salida);
        else
            await Taller.ValidarUnoAbierto(_db, unidad); // un solo mantenimiento abierto por bus

        var m = new Mantenimiento
        {
            id_unidad = dto.id_unidad,
            fecha = dto.fecha.Date,
            km = dto.km,
            tipo = tipoNormal,
            detalle = Reglas.Opcional(dto.detalle, "detalle", 300),
            foto = Reglas.Opcional(dto.foto, "foto", 260), // D3: enlace de texto
            fecha_salida = dto.fecha_salida?.Date
        };
        _db.Mantenimientos.Add(m);
        await _db.SaveChangesAsync();
        return Ok(Respuesta(m, unidad.placa));
    }

    /// <summary>Registra la salida del taller. Sin cuerpo o sin fecha_salida = hoy (Lima).</summary>
    [HttpPost("{id:int}/salida")]
    public async Task<IActionResult> RegistrarSalida(int id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] SalidaDto? dto)
    {
        var m = await Buscar(id);
        if (m.fecha_salida is DateTime ya)
            throw ReglaException.Conflicto(
                $"El mantenimiento {id} ya tiene salida registrada el {ya:dd/MM/yyyy}. Para corregirla use PUT /api/mantenimiento/{id}/salida.");

        var salida = dto?.fecha_salida?.Date ?? HoraPeru.Hoy;
        ValidarSalida(m.fecha, salida);
        m.fecha_salida = salida;
        await LiberarEstadoGuardado(m);
        await _db.SaveChangesAsync();
        return Ok(await RespuestaConPlaca(m));
    }

    /// <summary>Corrige la fecha de salida (registrada por error o con otra fecha).</summary>
    [HttpPut("{id:int}/salida")]
    public async Task<IActionResult> CorregirSalida(int id, [FromBody] SalidaDto dto)
    {
        var m = await Buscar(id);
        if (dto.fecha_salida is not DateTime salida)
            throw new ReglaException(
                $"Indique la fecha_salida corregida. Para deshacer la salida use DELETE /api/mantenimiento/{id}/salida.");
        ValidarSalida(m.fecha, salida);
        m.fecha_salida = salida.Date;
        await LiberarEstadoGuardado(m);
        await _db.SaveChangesAsync();
        return Ok(await RespuestaConPlaca(m));
    }

    /// <summary>Deshace una salida registrada por error: el bus vuelve a quedar en taller.</summary>
    [HttpDelete("{id:int}/salida")]
    public async Task<IActionResult> DeshacerSalida(int id)
    {
        var m = await Buscar(id);
        if (m.fecha_salida is null)
            throw ReglaException.Conflicto($"El mantenimiento {id} no tiene salida registrada; el bus sigue en taller.");

        var unidad = await Reglas.UnidadExistente(_db, m.id_unidad);
        // Solo se reabre el último ingreso del bus: reabrir uno antiguo dejaría el bus «en taller» encima de ingresos posteriores.
        var posterior = await _db.Mantenimientos.AsNoTracking()
            .Where(x => x.id_unidad == m.id_unidad && x.id_mantenimiento != id
                        && (x.fecha > m.fecha || (x.fecha == m.fecha && x.id_mantenimiento > id)))
            .Select(x => (int?)x.id_mantenimiento).FirstOrDefaultAsync();
        if (posterior is int p)
            throw ReglaException.Conflicto(
                $"No se puede deshacer: el bus {unidad.placa} tiene un ingreso posterior al taller (mantenimiento {p}). " +
                $"Corrija la fecha con PUT /api/mantenimiento/{id}/salida.");
        await Taller.ValidarUnoAbierto(_db, unidad, excepto: id);

        m.fecha_salida = null;
        await _db.SaveChangesAsync();
        return Ok(Respuesta(m, unidad.placa));
    }

    /// <summary>
    /// Si la unidad tenía guardado a mano «En mantenimiento», al registrar la salida pasa a «Operativo»
    /// (salvo que siga en taller hoy por otro mantenimiento); si no, el estado derivado quedaría fijo.
    /// </summary>
    private async Task LiberarEstadoGuardado(Mantenimiento m)
    {
        var unidad = await _db.Unidades.FirstAsync(u => u.id_unidad == m.id_unidad);
        if (!unidad.activo || !string.Equals(unidad.estado?.Trim(), Taller.EstadoEnMantenimiento, StringComparison.OrdinalIgnoreCase))
            return;
        var hoy = HoraPeru.Hoy;
        var sigueEnTaller = await _db.Mantenimientos
            .Where(x => x.id_unidad == m.id_unidad && x.id_mantenimiento != m.id_mantenimiento)
            .EnTallerEl(hoy).AnyAsync()
            || m.fecha <= hoy && m.fecha_salida > hoy;
        if (!sigueEnTaller) unidad.estado = Reglas.EstadoOperativo;
    }

    private static void ValidarSalida(DateTime ingreso, DateTime salida)
    {
        if (salida.Date < ingreso.Date)
            throw new ReglaException(
                $"La fecha de salida ({salida:dd/MM/yyyy}) no puede ser anterior a la de ingreso ({ingreso:dd/MM/yyyy}).");
        Reglas.V06FechaNoFutura(salida, "fecha de salida");
    }

    private async Task<Mantenimiento> Buscar(int id)
        => await _db.Mantenimientos.FirstOrDefaultAsync(m => m.id_mantenimiento == id)
           ?? throw ReglaException.NoEncontrado($"El mantenimiento {id} no existe.");

    private async Task<object> RespuestaConPlaca(Mantenimiento m)
        => Respuesta(m, await _db.Unidades.Where(u => u.id_unidad == m.id_unidad).Select(u => u.placa).FirstAsync());

    /// <summary>Contrato de /api/mantenimiento: fechas yyyy-MM-dd; fecha_salida null = sigue en taller.</summary>
    internal static object Respuesta(Mantenimiento m, string placa)
    {
        var hoy = HoraPeru.Hoy;
        return new
        {
            m.id_mantenimiento,
            m.id_unidad,
            placa,
            fecha = m.fecha.ToString("yyyy-MM-dd"),
            m.km,
            m.tipo,
            m.detalle,
            m.foto,
            fecha_salida = m.fecha_salida?.ToString("yyyy-MM-dd"),
            abierto = m.fecha_salida is null,
            en_taller_hoy = m.fecha <= hoy && (m.fecha_salida is null || m.fecha_salida > hoy),
            dias_en_taller = Taller.DiasEnTaller(m.fecha, m.fecha_salida)
        };
    }
}
