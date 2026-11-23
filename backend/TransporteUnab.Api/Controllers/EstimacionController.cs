using System.Globalization;
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

    /// <summary>
    /// HU-29: compara todos los buses activos para un viaje. Con id_solicitud, las fechas, horas y pasajeros salen
    /// de la solicitud (tiene prioridad sobre fecha y pasajeros); sin ella, el viaje es el día «fecha» completo.
    /// Rendimiento: el del cierre del trimestre anterior al del viaje o, si no hay, el de los últimos 3 meses hasta hoy
    /// (Calculos.ResumirPeriodo, el mismo método que el cierre y /reportes/por-unidad).
    /// costo_estimado = distancia_km ÷ rendimiento × precio_galon, como en el POST.
    /// </summary>
    [HttpGet("comparar")]
    public async Task<IActionResult> Comparar([FromQuery] int? distancia_km, [FromQuery] decimal? precio_galon,
        [FromQuery] int? id_solicitud, [FromQuery] DateTime? fecha, [FromQuery] int? pasajeros)
    {
        if (distancia_km is not > 0) throw new ReglaException("Indique distancia_km mayor a 0 (distancia total del viaje).");
        if (precio_galon is not > 0) throw new ReglaException("Indique precio_galon mayor a 0.");
        if (precio_galon > 999_999.99m) throw new ReglaException("El precio por galón es demasiado grande.");
        if (pasajeros is <= 0) throw new ReglaException("La cantidad de pasajeros debe ser mayor a 0.");
        var precio = Math.Round(precio_galon.Value, 2, MidpointRounding.AwayFromZero);

        // Ventana del viaje (hora de Lima).
        DateTime salida, regreso;
        int? idSolicitudActual = null;
        if (id_solicitud is > 0)
        {
            var s = await _db.SolicitudesViaje.AsNoTracking().FirstOrDefaultAsync(x => x.id_solicitud == id_solicitud)
                    ?? throw ReglaException.NoEncontrado($"La solicitud {id_solicitud} no existe.");
            idSolicitudActual = s.id_solicitud;
            salida = s.fecha_salida.Date + s.hora_salida;
            regreso = s.fecha_regreso.Date + s.hora_regreso;
            pasajeros = s.pasajeros;
        }
        else if (fecha is DateTime f)
        {
            if (f.Year is < 2000 or > 2100) throw new ReglaException("La fecha no es válida.");
            salida = f.Date;
            regreso = f.Date.AddDays(1); // el día completo
        }
        else throw new ReglaException("Indique id_solicitud, o bien fecha (yyyy-MM-dd) del viaje.");

        var diaSalida = salida.Date;
        var diaRegreso = regreso.TimeOfDay == TimeSpan.Zero && regreso > salida ? regreso.Date.AddDays(-1) : regreso.Date;

        var buses = (await _db.Unidades.AsNoTracking().Where(u => u.activo).ToListAsync())
            .Where(Reglas.EsBus).ToList();
        var ids = buses.Select(b => b.id_unidad).ToList();

        // 1) Rendimiento del cierre del trimestre inmediatamente anterior al del viaje.
        var (anioViaje, trimViaje) = Calculos.TrimestreDe(diaSalida);
        var (anioAnt, trimAnt) = trimViaje == 1 ? ((short)(anioViaje - 1), (byte)4) : (anioViaje, (byte)(trimViaje - 1));
        var cierre = await _db.CierresTrimestrales.AsNoTracking()
            .FirstOrDefaultAsync(c => c.anio == anioAnt && c.trimestre == trimAnt);
        var fuenteCierre = cierre is null ? null : $"Cierre T{cierre.trimestre} {cierre.anio}";
        var rendCierre = cierre is null
            ? new Dictionary<int, decimal>()
            : await _db.CierresUnidad.AsNoTracking()
                .Where(cu => cu.id_cierre == cierre.id_cierre && ids.Contains(cu.id_unidad) && cu.rendimiento != null)
                .ToDictionaryAsync(cu => cu.id_unidad, cu => cu.rendimiento!.Value);

        // 2) Taller durante el viaje (misma regla que Taller.cs, por rango de días).
        var taller = (await _db.Mantenimientos.AsNoTracking()
                .Where(m => ids.Contains(m.id_unidad)).EnTallerEntre(diaSalida, diaRegreso)
                .Select(m => new { m.id_unidad, m.fecha })
                .ToListAsync())
            .GroupBy(m => m.id_unidad)
            .ToDictionary(g => g.Key, g => g.Max(m => m.fecha));

        // 3) Viajes aprobados de otras solicitudes, con una estimación de ese bus, que se crucen con este viaje.
        var aprobados = (await _db.EstimacionesViaje.AsNoTracking()
                .Where(e => e.id_solicitud != null && ids.Contains(e.id_unidad))
                .Join(_db.SolicitudesViaje.Where(s => s.estado == "Aprobada" && s.id_solicitud != (idSolicitudActual ?? 0)
                          && s.fecha_salida <= diaRegreso && s.fecha_regreso >= diaSalida),
                    e => e.id_solicitud, s => s.id_solicitud,
                    (e, s) => new { e.id_unidad, s.id_solicitud, s.codigo, s.fecha_salida, s.hora_salida, s.fecha_regreso, s.hora_regreso })
                .ToListAsync())
            .Select(x => new { x.id_unidad, x.id_solicitud, x.codigo, ini = x.fecha_salida.Date + x.hora_salida, fin = x.fecha_regreso.Date + x.hora_regreso })
            .Where(x => x.ini < regreso && salida < x.fin) // se cruzan
            .DistinctBy(x => (x.id_unidad, x.id_solicitud))
            .ToList();

        var hoy = HoraPeru.Hoy;
        var filas = new List<FilaComparacion>();
        foreach (var b in buses)
        {
            var avisos = new List<string>();
            var disponible = true;

            decimal? rendimiento;
            string? fuente;
            if (rendCierre.TryGetValue(b.id_unidad, out var rc))
            {
                rendimiento = rc;
                fuente = fuenteCierre;
            }
            else
            {
                var r = await Calculos.ResumirPeriodo(_db, b.id_unidad, hoy.AddMonths(-3), hoy.AddDays(1));
                rendimiento = r.rendimiento;
                fuente = rendimiento is null ? null : "Últimos 3 meses";
            }
            decimal? costo = rendimiento is > 0
                ? Math.Round(distancia_km.Value / rendimiento.Value * precio, 2, MidpointRounding.AwayFromZero)
                : null;
            if (costo is null) avisos.Add("Sin datos de rendimiento");

            if (taller.TryGetValue(b.id_unidad, out var ingreso))
            {
                disponible = false;
                avisos.Add(string.Create(CultureInfo.InvariantCulture, $"En taller (ingresó el {ingreso:dd/MM/yyyy})"));
            }
            if (b.capacidad is null)
                avisos.Add("Capacidad no registrada");
            else if (pasajeros is int p && b.capacidad < p)
            {
                disponible = false;
                avisos.Add($"Capacidad {b.capacidad} < {p} pasajeros");
            }
            foreach (var a in aprobados.Where(a => a.id_unidad == b.id_unidad).OrderBy(a => a.ini))
                avisos.Add(string.Create(CultureInfo.InvariantCulture,
                    $"Tiene otro viaje aprobado: {a.codigo} ({a.ini:dd/MM HH:mm} – {a.fin:dd/MM HH:mm})"));

            filas.Add(new FilaComparacion(b.id_unidad, b.placa, Reglas.NumeroBus(b.placa), b.capacidad, rendimiento, fuente,
                costo, disponible, avisos));
        }

        // Orden: disponibles con costo (menor a mayor), disponibles sin rendimiento, no disponibles.
        var ordenadas = filas
            .OrderBy(f => !f.disponible ? 2 : f.costo_estimado is null ? 1 : 0)
            .ThenBy(f => f.costo_estimado ?? decimal.MaxValue)
            .ThenBy(f => f.placa)
            .ToList();
        var masEconomico = ordenadas.FirstOrDefault(f => f.disponible && f.costo_estimado is not null);

        return Ok(new
        {
            fecha = diaSalida.ToString("yyyy-MM-dd"),
            pasajeros,
            fuente_cierre = fuenteCierre,
            buses = ordenadas.Select(f => new
            {
                f.id_unidad,
                f.placa,
                f.numero_bus,
                f.capacidad,
                f.rendimiento,
                f.fuente_rendimiento,
                f.costo_estimado,
                f.disponible,
                mas_economico = ReferenceEquals(f, masEconomico),
                f.avisos
            })
        });
    }

    private record FilaComparacion(int id_unidad, string placa, string? numero_bus, int? capacidad, decimal? rendimiento,
        string? fuente_rendimiento, decimal? costo_estimado, bool disponible, List<string> avisos);

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
