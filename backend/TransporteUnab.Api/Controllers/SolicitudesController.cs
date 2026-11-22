using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

/// <summary>
/// Solicitudes de viaje de las áreas. El código se copia del documento físico (único).
/// Estados: Pendiente (al crear) → Estimada (al registrar la primera estimación) → Aprobada / Rechazada.
/// </summary>
[ApiController]
[Route("api/solicitudes")]
public class SolicitudesController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public SolicitudesController(TransporteDbContext db) => _db = db;

    /// <summary>Fechas yyyy-MM-dd y horas HH:mm, en hora de Lima. El estado no se envía: nace «Pendiente».</summary>
    public record SolicitudDto(string codigo, int id_area, string encargado, DateTime fecha_salida, string hora_salida,
        DateTime fecha_regreso, string hora_regreso, string lugar_procedencia, string lugar_destino, string motivo,
        int pasajeros, string? observaciones);

    public record EstadoDto(string estado, string? observaciones);

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? estado, [FromQuery] int? id_area,
        [FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
    {
        var q = _db.SolicitudesViaje.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(estado))
        {
            var e = Reglas.EstadoSolicitud(estado);
            q = q.Where(s => s.estado == e);
        }
        if (id_area is int ia) q = q.Where(s => s.id_area == ia);
        if (desde is not null && hasta is not null && hasta.Value.Date < desde.Value.Date)
            throw new ReglaException("La fecha 'hasta' no puede ser anterior a 'desde'.");
        // El rango filtra por la fecha de salida del viaje (ambos extremos inclusive).
        if (desde is not null) { var d = desde.Value.Date; q = q.Where(s => s.fecha_salida >= d); }
        if (hasta is not null) { var h = hasta.Value.Date; q = q.Where(s => s.fecha_salida <= h); }

        var lista = await Proyectar(q
            .OrderByDescending(s => s.fecha_salida).ThenByDescending(s => s.hora_salida).ThenByDescending(s => s.id_solicitud))
            .ToListAsync();
        return Ok(lista.Select(Respuesta));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var fila = await Proyectar(_db.SolicitudesViaje.AsNoTracking().Where(s => s.id_solicitud == id)).FirstOrDefaultAsync()
                   ?? throw ReglaException.NoEncontrado($"La solicitud {id} no existe.");
        return Ok(Respuesta(fila));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SolicitudDto dto)
    {
        var s = new SolicitudViaje { estado = Reglas.EstadosSolicitud[0] }; // nace «Pendiente»
        await Validar(s, dto, null);
        _db.SolicitudesViaje.Add(s);
        await _db.SaveChangesAsync();
        return Ok(await Uno(s.id_solicitud));
    }

    /// <summary>Corrige los datos de la solicitud. El estado se cambia con PUT {id}/estado.</summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SolicitudDto dto)
    {
        var s = await Buscar(id);
        await Validar(s, dto, id);
        await _db.SaveChangesAsync();
        return Ok(await Uno(id));
    }

    [HttpPut("{id:int}/estado")]
    public async Task<IActionResult> CambiarEstado(int id, [FromBody] EstadoDto dto)
    {
        var s = await Buscar(id);
        s.estado = Reglas.EstadoSolicitud(dto.estado);
        if (dto.observaciones is not null) s.observaciones = Reglas.Opcional(dto.observaciones, "observaciones", 300);
        await _db.SaveChangesAsync();
        return Ok(await Uno(id));
    }

    private async Task Validar(SolicitudViaje s, SolicitudDto dto, int? id)
    {
        var codigo = Reglas.Requerido(dto.codigo, "codigo", 30);
        if (await _db.SolicitudesViaje.AnyAsync(x => x.codigo == codigo && x.id_solicitud != (id ?? 0)))
            throw ReglaException.Conflicto($"Ya existe una solicitud de viaje con el código '{codigo}'.", "V-07");

        if (!await _db.Areas.AnyAsync(a => a.id_area == dto.id_area))
            throw new ReglaException($"El área {dto.id_area} no existe.");

        var encargado = Reglas.Requerido(dto.encargado, "encargado", 100);
        var procedencia = Reglas.Requerido(dto.lugar_procedencia, "lugar_procedencia", 100);
        var destino = Reglas.Requerido(dto.lugar_destino, "lugar_destino", 100);
        var motivo = Reglas.Requerido(dto.motivo, "motivo", 300);
        var observaciones = Reglas.Opcional(dto.observaciones, "observaciones", 300);
        if (dto.pasajeros <= 0) throw new ReglaException("La cantidad de pasajeros debe ser mayor a 0.");

        var horaSalida = Reglas.ParseHora(dto.hora_salida, "hora de salida");
        var horaRegreso = Reglas.ParseHora(dto.hora_regreso, "hora de regreso");
        var fechaSalida = dto.fecha_salida.Date;
        var fechaRegreso = dto.fecha_regreso.Date;
        if (fechaSalida.Year < 2000 || fechaRegreso.Year < 2000 || fechaRegreso.Year > 2100)
            throw new ReglaException("Las fechas de salida y regreso no son válidas.");
        // Fechas y horas en hora de Lima, tal como figuran en el documento.
        if (fechaRegreso + horaRegreso <= fechaSalida + horaSalida)
            throw new ReglaException(
                $"El regreso ({fechaRegreso:dd/MM/yyyy} {horaRegreso:hh\\:mm}) debe ser posterior a la salida ({fechaSalida:dd/MM/yyyy} {horaSalida:hh\\:mm}).");

        s.codigo = codigo;
        s.id_area = dto.id_area;
        s.encargado = encargado;
        s.fecha_salida = fechaSalida;
        s.hora_salida = horaSalida;
        s.fecha_regreso = fechaRegreso;
        s.hora_regreso = horaRegreso;
        s.lugar_procedencia = procedencia;
        s.lugar_destino = destino;
        s.motivo = motivo;
        s.pasajeros = dto.pasajeros;
        s.observaciones = observaciones;
    }

    private async Task<SolicitudViaje> Buscar(int id)
        => await _db.SolicitudesViaje.FirstOrDefaultAsync(s => s.id_solicitud == id)
           ?? throw ReglaException.NoEncontrado($"La solicitud {id} no existe.");

    private async Task<object> Uno(int id)
        => Respuesta(await Proyectar(_db.SolicitudesViaje.AsNoTracking().Where(s => s.id_solicitud == id)).FirstAsync());

    private record Fila(SolicitudViaje s, string? area_nombre, int cantidad_estimaciones);

    private IQueryable<Fila> Proyectar(IQueryable<SolicitudViaje> q)
        => q.Select(s => new Fila(s,
            _db.Areas.Where(a => a.id_area == s.id_area).Select(a => a.nombre).FirstOrDefault(),
            _db.EstimacionesViaje.Count(e => e.id_solicitud == s.id_solicitud)));

    private static object Respuesta(Fila f) => new
    {
        f.s.id_solicitud,
        f.s.codigo,
        f.s.id_area,
        f.area_nombre,
        f.s.encargado,
        fecha_salida = f.s.fecha_salida.ToString("yyyy-MM-dd"),
        hora_salida = f.s.hora_salida.ToString(@"hh\:mm"),
        fecha_regreso = f.s.fecha_regreso.ToString("yyyy-MM-dd"),
        hora_regreso = f.s.hora_regreso.ToString(@"hh\:mm"),
        f.s.lugar_procedencia,
        f.s.lugar_destino,
        f.s.motivo,
        f.s.pasajeros,
        f.s.estado,
        f.s.observaciones,
        f.cantidad_estimaciones
    };
}
