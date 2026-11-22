using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TurnosController : ControllerBase
{
    private readonly TransporteDbContext _db;
    private readonly OpcionesValidacion _op;
    public TurnosController(TransporteDbContext db, IOptions<OpcionesValidacion> op) { _db = db; _op = op.Value; }

    /// <summary>id_ruta = 0 o null: turno sin ruta. id_rutas (opcional) permite varias rutas por turno.</summary>
    public record TurnoDto(int id_unidad, int id_conductor, int? id_ruta, DateTime fecha, string hora_salida,
        string hora_llegada, int km_inicial, int km_final, string? observaciones, int[]? id_rutas = null);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var turnos = await _db.BitacoraTurnos
            .AsNoTracking()
            .OrderByDescending(t => t.fecha).ThenByDescending(t => t.hora_salida).ThenByDescending(t => t.id_turno)
            .Select(t => new
            {
                t.id_turno,
                t.id_unidad,
                t.id_conductor,
                placa = t.Unidad!.placa,
                conductor = t.Conductor!.nombres + " " + t.Conductor.apellidos,
                t.fecha,
                t.hora_salida,
                t.hora_llegada,
                t.km_inicial,
                t.km_final,
                t.km_recorridos,
                t.observaciones
            })
            .ToListAsync();

        var ids = turnos.Select(t => t.id_turno).ToList();
        var rutas = (await _db.TurnoRutas.AsNoTracking()
                .Where(tr => ids.Contains(tr.id_turno))
                .OrderBy(tr => tr.id_turno_ruta)
                .Select(tr => new { tr.id_turno, tr.id_ruta, texto = tr.Ruta!.punto_salida + " ↔ " + tr.Ruta.punto_llegada })
                .ToListAsync())
            .GroupBy(r => r.id_turno)
            .ToDictionary(g => g.Key, g => g.ToList());

        return Ok(turnos.Select(t =>
        {
            var rs = rutas.GetValueOrDefault(t.id_turno);
            return new
            {
                t.id_turno,
                t.id_unidad,
                t.id_conductor,
                t.placa,
                t.conductor,
                fecha = t.fecha.ToString("yyyy-MM-dd"),
                hora_salida = t.hora_salida.ToString(@"hh\:mm"),
                hora_llegada = t.hora_llegada.ToString(@"hh\:mm"),
                t.km_inicial,
                t.km_final,
                t.km_recorridos,
                t.observaciones,
                ruta_texto = rs is { Count: > 0 } ? string.Join(", ", rs.Select(r => r.texto)) : "-",
                id_ruta = rs?.FirstOrDefault()?.id_ruta,
                id_rutas = rs?.Select(r => r.id_ruta).ToArray() ?? Array.Empty<int>()
            };
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TurnoDto dto)
    {
        var turno = new BitacoraTurno();
        var idsRuta = await Validar(dto, turno, null);
        Asignar(turno, dto);
        _db.BitacoraTurnos.Add(turno);
        await _db.SaveChangesAsync();

        foreach (var idRuta in idsRuta)
            _db.TurnoRutas.Add(new TurnoRuta { id_turno = turno.id_turno, id_ruta = idRuta });
        await _db.SaveChangesAsync();

        await AvisarCierres(turno.fecha);
        return Ok(await ConAviso(turno));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] TurnoDto dto)
    {
        var turno = await _db.BitacoraTurnos.FindAsync(id)
                    ?? throw ReglaException.NoEncontrado($"El turno {id} no existe.");
        var fechaAnterior = turno.fecha;
        var idsRuta = await Validar(dto, turno, id);
        Asignar(turno, dto);

        // Solo se reemplazan las rutas si el cliente envía rutas nuevas: id_rutas (aunque sea [])
        // o un id_ruta > 0. id_ruta 0/null en un PUT = no cambiar (la web deshabilita el selector al editar).
        if (ReemplazaRutas(dto, esNuevo: false))
        {
            _db.TurnoRutas.RemoveRange(_db.TurnoRutas.Where(x => x.id_turno == id));
            foreach (var idRuta in idsRuta)
                _db.TurnoRutas.Add(new TurnoRuta { id_turno = id, id_ruta = idRuta });
        }
        await _db.SaveChangesAsync();

        await AvisarCierres(fechaAnterior, turno.fecha);
        return Ok(await ConAviso(turno));
    }

    /// <summary>No hay anulación de turnos (decisión 12): se corrigen con PUT.</summary>
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
        => StatusCode(StatusCodes.Status405MethodNotAllowed, new
        {
            message = "Los turnos no se eliminan ni se anulan. Corrija el registro con la opción Editar.",
            codigo = (string?)null
        });

    private async Task<List<int>> Validar(TurnoDto dto, BitacoraTurno actual, int? idTurno)
    {
        var fecha = dto.fecha.Date;
        var salida = Reglas.ParseHora(dto.hora_salida, "hora de salida");
        var llegada = Reglas.ParseHora(dto.hora_llegada, "hora de llegada");
        Reglas.Opcional(dto.observaciones, "observaciones", 300);

        Reglas.V01KmTurno(dto.km_inicial, dto.km_final);
        Reglas.V05Horas(salida, llegada);
        Reglas.V06FechaNoFutura(fecha);

        var unidad = await Reglas.UnidadExistente(_db, dto.id_unidad);
        var conductor = await Reglas.ConductorExistente(_db, dto.id_conductor);
        Reglas.SoloBuses(unidad, "La bitácora de turnos");

        // V-10 y V-13 al registrar, o al cambiar la unidad o el conductor de un turno existente
        // (la asignación de conductores cambia con el tiempo y no debe impedir corregir turnos antiguos).
        var cambiaAsignacion = idTurno is null || actual.id_unidad != dto.id_unidad || actual.id_conductor != dto.id_conductor;
        if (cambiaAsignacion)
        {
            Reglas.V10Activos(unidad, conductor);
            Reglas.V13ConductorDeUnidad(conductor, unidad);
        }

        await Reglas.V03KmTurno(_db, dto.id_unidad, fecha, salida, dto.km_inicial, dto.km_final, idTurno);

        // id_rutas (varias) tiene prioridad sobre id_ruta (una). Un turno puede repetir una ruta.
        // Al editar sin enviar rutas nuevas, V-02 se revisa con las rutas que ya tiene el turno.
        var idsRuta = ReemplazaRutas(dto, esNuevo: idTurno is null)
            ? dto.id_rutas is not null
                ? dto.id_rutas.Where(x => x > 0).ToList()
                : dto.id_ruta is > 0 ? new List<int> { dto.id_ruta.Value } : new List<int>()
            : await _db.TurnoRutas.Where(tr => tr.id_turno == idTurno).Select(tr => tr.id_ruta).ToListAsync();
        if (idsRuta.Count > 0)
        {
            var distintas = idsRuta.Distinct().ToList();
            var existentes = await _db.Rutas.Where(r => distintas.Contains(r.id_ruta)).Select(r => r.id_ruta).ToListAsync();
            var faltante = distintas.Except(existentes).FirstOrDefault();
            if (faltante != 0) throw new ReglaException($"La ruta {faltante} no existe.");
        }
        await Reglas.V02KmRutas(_db, _op, dto.km_final - dto.km_inicial, idsRuta);
        return idsRuta;
    }

    private static bool ReemplazaRutas(TurnoDto dto, bool esNuevo)
        => esNuevo || dto.id_rutas is not null || dto.id_ruta is > 0;

    private static void Asignar(BitacoraTurno t, TurnoDto dto)
    {
        t.id_unidad = dto.id_unidad;
        t.id_conductor = dto.id_conductor;
        t.fecha = dto.fecha.Date;
        t.hora_salida = Reglas.ParseHora(dto.hora_salida, "hora de salida");
        t.hora_llegada = Reglas.ParseHora(dto.hora_llegada, "hora de llegada");
        t.km_inicial = dto.km_inicial;
        t.km_final = dto.km_final;
        t.observaciones = Reglas.Limpiar(dto.observaciones);
    }

    /// <summary>
    /// Mismos campos que antes (la entidad) más «aviso»: texto para mostrar si el bus figura en taller
    /// en la fecha del turno. No bloquea el registro. null si no hay nada que avisar.
    /// </summary>
    private async Task<object> ConAviso(BitacoraTurno t)
    {
        var placa = await _db.Unidades.Where(u => u.id_unidad == t.id_unidad).Select(u => u.placa).FirstOrDefaultAsync();
        return new
        {
            t.id_turno,
            t.id_unidad,
            t.id_conductor,
            t.fecha,
            t.hora_salida,
            t.hora_llegada,
            t.km_inicial,
            t.km_final,
            t.km_recorridos,
            t.observaciones,
            aviso = await Taller.AvisoTurno(_db, t.id_unidad, placa, t.fecha)
        };
    }

    private async Task AvisarCierres(params DateTime[] fechas)
    {
        var recalculados = await Calculos.RecalcularCierresAfectados(_db, fechas);
        if (recalculados.Count > 0)
            Response.Headers["X-Cierres-Recalculados"] = string.Join(",", recalculados);
    }
}
