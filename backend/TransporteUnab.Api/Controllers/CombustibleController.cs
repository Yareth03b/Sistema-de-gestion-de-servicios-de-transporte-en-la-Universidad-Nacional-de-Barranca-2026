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
public class CombustibleController : ControllerBase
{
    private readonly TransporteDbContext _db;
    private readonly OpcionesValidacion _op;
    public CombustibleController(TransporteDbContext db, IOptions<OpcionesValidacion> op) { _db = db; _op = op.Value; }

    public record AbastecimientoDto(int id_unidad, int id_conductor, int? id_area, string nro_vale, DateTime fecha,
        int km_actual, decimal galones, string tipo_combustible, string? observaciones);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var vales = await _db.Abastecimientos.AsNoTracking().ToListAsync();
        var calculo = Calculos.PorVale(vales);

        var unidades = await _db.Unidades.AsNoTracking().ToDictionaryAsync(u => u.id_unidad, u => u.placa);
        var conductores = await _db.Conductores.AsNoTracking()
            .ToDictionaryAsync(c => c.id_conductor, c => c.nombres + " " + c.apellidos);
        var areas = await _db.Areas.AsNoTracking().ToDictionaryAsync(a => a.id_area, a => a.nombre);

        return Ok(vales
            .OrderByDescending(a => a.fecha).ThenByDescending(a => a.km_actual).ThenByDescending(a => a.id_abastecimiento)
            .Select(a =>
            {
                var c = calculo[a.id_abastecimiento];
                return new
                {
                    a.id_abastecimiento,
                    a.id_unidad,
                    a.id_conductor,
                    a.id_area,
                    a.nro_vale,
                    fecha = a.fecha.ToString("yyyy-MM-dd"),
                    placa = unidades.GetValueOrDefault(a.id_unidad, "-"),
                    conductor = conductores.GetValueOrDefault(a.id_conductor, "-"),
                    area_nombre = a.id_area is int ia ? areas.GetValueOrDefault(ia, "-") : "-",
                    a.km_actual,
                    a.galones,
                    a.tipo_combustible,
                    a.observaciones,
                    // Calculados, no guardados. null = sin vale anterior de la unidad.
                    c.km_consumidos,
                    c.rendimiento,
                    rendimiento_sospechoso = Reglas.V09Sospechoso(_op, c.rendimiento)
                };
            }));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AbastecimientoDto dto)
    {
        var entity = new Abastecimiento();
        await Validar(dto, entity, null);
        Asignar(entity, dto);
        _db.Abastecimientos.Add(entity);
        await _db.SaveChangesAsync();
        await AvisarCierres(entity.fecha);
        return Ok(entity);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] AbastecimientoDto dto)
    {
        var entity = await _db.Abastecimientos.FindAsync(id)
                     ?? throw ReglaException.NoEncontrado($"El vale {id} no existe.");
        var fechaAnterior = entity.fecha;
        await Validar(dto, entity, id);
        Asignar(entity, dto);
        await _db.SaveChangesAsync();
        await AvisarCierres(fechaAnterior, entity.fecha);
        return Ok(entity);
    }

    private async Task Validar(AbastecimientoDto dto, Abastecimiento actual, int? id)
    {
        var nroVale = Reglas.Requerido(dto.nro_vale, "nro_vale", 20);
        Reglas.Requerido(dto.tipo_combustible, "tipo_combustible", 20);
        Reglas.Opcional(dto.observaciones, "observaciones", 300);

        Reglas.V04Galones(dto.galones);
        Reglas.V06FechaNoFutura(dto.fecha);
        await Reglas.V07ValeUnico(_db, nroVale, id);

        var unidad = await Reglas.UnidadExistente(_db, dto.id_unidad);
        var conductor = await Reglas.ConductorExistente(_db, dto.id_conductor);
        if (dto.id_area is int idArea && !await _db.Areas.AnyAsync(a => a.id_area == idArea))
            throw new ReglaException($"El área {idArea} no existe.");

        var cambiaAsignacion = id is null || actual.id_unidad != dto.id_unidad || actual.id_conductor != dto.id_conductor;
        if (cambiaAsignacion)
        {
            Reglas.V10Activos(unidad, conductor);
            Reglas.V13ConductorDeUnidad(conductor, unidad);
        }

        await Reglas.V03KmVale(_db, dto.id_unidad, dto.fecha.Date, dto.km_actual, id);
    }

    private static void Asignar(Abastecimiento e, AbastecimientoDto dto)
    {
        e.id_unidad = dto.id_unidad;
        e.id_conductor = dto.id_conductor;
        e.id_area = dto.id_area;
        e.nro_vale = dto.nro_vale.Trim();
        e.fecha = dto.fecha.Date;
        e.km_actual = dto.km_actual;
        e.galones = Math.Round(dto.galones, 2, MidpointRounding.AwayFromZero);
        e.tipo_combustible = dto.tipo_combustible.Trim();
        e.observaciones = Reglas.Limpiar(dto.observaciones);
    }

    private async Task AvisarCierres(params DateTime[] fechas)
    {
        var recalculados = await Calculos.RecalcularCierresAfectados(_db, fechas);
        if (recalculados.Count > 0)
            Response.Headers["X-Cierres-Recalculados"] = string.Join(",", recalculados);
    }
}
