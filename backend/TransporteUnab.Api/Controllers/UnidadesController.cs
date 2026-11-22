using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UnidadesController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public UnidadesController(TransporteDbContext db) => _db = db;

    public record UnidadDto(string placa, string tipo, string marca, string modelo, string? codigo_patrimonial,
        int? capacidad, string? estado, int? id_usuario = null);

    public record DocumentoDto(int id_unidad, string tipo, string numero, DateTime fecha_vencimiento);

    public record IncidenteDto(int id_unidad, DateTime fecha, string descripcion);

    /// <summary>Por defecto solo unidades activas. ?incluir_inactivas=true devuelve también las dadas de baja.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool incluir_inactivas = false)
    {
        var list = await _db.Unidades.AsNoTracking()
            .Where(u => incluir_inactivas || u.activo)
            .OrderBy(u => u.placa)
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
                km_turnos = _db.BitacoraTurnos.Where(t => t.id_unidad == u.id_unidad).Max(t => (int?)t.km_final),
                km_vales = _db.Abastecimientos.Where(a => a.id_unidad == u.id_unidad).Max(a => (int?)a.km_actual)
            })
            .ToListAsync();

        var taller = await Taller.EnTallerPorUnidad(_db, HoraPeru.Hoy);

        return Ok(list.Select(u =>
        {
            var t = taller.GetValueOrDefault(u.id_unidad);
            return new
            {
                u.id_unidad,
                u.placa,
                u.tipo,
                u.marca,
                u.modelo,
                u.codigo_patrimonial,
                u.capacidad,
                // Estado DERIVADO: «En mantenimiento» si hoy está en taller; si no, el guardado.
                estado = Taller.EstadoDerivado(u.activo, u.estado, t is not null),
                estado_guardado = u.estado,
                en_taller = u.activo && t is not null,
                id_mantenimiento_taller = t?.id_mantenimiento,
                taller_desde = t?.fecha.ToString("yyyy-MM-dd"),
                dias_en_taller = t is null ? (int?)null : Taller.DiasEnTaller(t.fecha, t.fecha_salida),
                u.activo,
                numero_bus = Reglas.NumeroBus(u.placa),
                // Último km conocido: el mayor entre bitácora y vales (las unidades que no son bus no tienen bitácora).
                km_actual = Math.Max(u.km_turnos ?? 0, u.km_vales ?? 0)
            };
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UnidadDto dto)
    {
        var u = new UnidadTransporte { activo = true };
        await Asignar(u, dto, null);
        _db.Unidades.Add(u);
        await _db.SaveChangesAsync();
        return Ok(u);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UnidadDto dto)
    {
        var u = await BuscarUnidad(id);
        await Asignar(u, dto, id);
        await _db.SaveChangesAsync();
        return Ok(u);
    }

    /// <summary>Baja lógica (V-11): activo = 0. Las unidades nunca se borran físicamente.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DarDeBaja(int id)
    {
        var u = await BuscarUnidad(id);
        u.activo = false;
        if (Reglas.EsOperativo(u.estado)) u.estado = Reglas.EstadoInactivo; // V-14
        await _db.SaveChangesAsync();
        return Ok(u);
    }

    [HttpPut("{id:int}/reactivar")]
    public async Task<IActionResult> Reactivar(int id)
    {
        var u = await BuscarUnidad(id);
        u.activo = true;
        await _db.SaveChangesAsync();
        return Ok(u);
    }

    [HttpGet("{id:int}/historial")]
    public async Task<IActionResult> Historial(int id)
    {
        var unidad = await _db.Unidades.AsNoTracking().FirstOrDefaultAsync(u => u.id_unidad == id)
                     ?? throw ReglaException.NoEncontrado($"La unidad {id} no existe.");

        var turnos = await _db.BitacoraTurnos.AsNoTracking().Where(t => t.id_unidad == id)
            .OrderByDescending(t => t.fecha).ThenByDescending(t => t.hora_salida).ToListAsync();

        var vales = await _db.Abastecimientos.AsNoTracking().Where(a => a.id_unidad == id).ToListAsync();
        var calculo = Calculos.PorVale(vales);

        var incidentes = await _db.Incidentes.AsNoTracking().Where(i => i.id_unidad == id)
            .OrderByDescending(i => i.fecha).ToListAsync();

        var idsConductor = turnos.Select(t => t.id_conductor).Distinct().ToList();
        var nombres = await _db.Conductores.AsNoTracking().Where(c => idsConductor.Contains(c.id_conductor))
            .ToDictionaryAsync(c => c.id_conductor, c => c.nombres + " " + c.apellidos);

        var taller = (await Taller.EnTallerPorUnidad(_db, HoraPeru.Hoy, new[] { id })).GetValueOrDefault(id);
        var mantenimientos = await _db.Mantenimientos.AsNoTracking().Where(m => m.id_unidad == id)
            .OrderByDescending(m => m.fecha).ThenByDescending(m => m.km).ToListAsync();

        return Ok(new
        {
            unidad,
            numero_bus = Reglas.NumeroBus(unidad.placa),
            estado_actual = Taller.EstadoDerivado(unidad.activo, unidad.estado, taller is not null),
            en_taller = unidad.activo && taller is not null,
            turnos,
            abastecimientos = vales
                .OrderByDescending(a => a.fecha).ThenByDescending(a => a.km_actual)
                .Select(a => new
                {
                    a.id_abastecimiento,
                    a.id_unidad,
                    a.id_conductor,
                    a.id_area,
                    a.nro_vale,
                    a.fecha,
                    a.km_actual,
                    a.galones,
                    a.tipo_combustible,
                    a.observaciones,
                    calculo[a.id_abastecimiento].km_consumidos,
                    calculo[a.id_abastecimiento].rendimiento
                }),
            mantenimientos = mantenimientos.Select(m => new
            {
                m.id_mantenimiento,
                m.id_unidad,
                m.fecha,
                m.km,
                m.tipo,
                m.detalle,
                m.foto,
                m.fecha_salida,
                dias_en_taller = Taller.DiasEnTaller(m.fecha, m.fecha_salida)
            }),
            documentos = await _db.DocumentosUnidad.AsNoTracking().Where(d => d.id_unidad == id)
                .OrderBy(d => d.fecha_vencimiento).ToListAsync(),
            incidentes = incidentes.Select(i =>
            {
                // Decisión 13: el conductor no se guarda; es el del turno de esa unidad cuyo horario cubre la hora.
                var t = turnos.FirstOrDefault(t => t.fecha.Date == i.fecha.Date
                    && t.hora_salida <= i.fecha.TimeOfDay && i.fecha.TimeOfDay <= t.hora_llegada);
                return new
                {
                    i.id_incidente,
                    i.id_unidad,
                    i.fecha,
                    i.descripcion,
                    id_conductor = t?.id_conductor,
                    conductor = t is null ? null : nombres.GetValueOrDefault(t.id_conductor)
                };
            })
        });
    }

    [HttpPost("documentos")]
    public async Task<IActionResult> AddDocumento([FromBody] DocumentoDto dto)
    {
        var unidad = await Reglas.UnidadExistente(_db, dto.id_unidad);
        Reglas.SoloBuses(unidad, "Los documentos");
        if (dto.fecha_vencimiento.Year < 2000)
            throw new ReglaException("La fecha de vencimiento no es válida.");

        var doc = new DocumentoUnidad
        {
            id_unidad = dto.id_unidad,
            tipo = Reglas.Requerido(dto.tipo, "tipo", 20),
            numero = Reglas.Requerido(dto.numero, "numero", 30),
            fecha_vencimiento = dto.fecha_vencimiento.Date
        };
        _db.DocumentosUnidad.Add(doc);
        await _db.SaveChangesAsync();
        return Ok(doc);
    }

    [HttpPost("incidentes")]
    public async Task<IActionResult> AddIncidente([FromBody] IncidenteDto dto)
    {
        var inc = new Incidente { id_unidad = dto.id_unidad };
        await ValidarIncidente(inc, dto);
        _db.Incidentes.Add(inc);
        await _db.SaveChangesAsync();
        return Ok(inc);
    }

    [HttpPut("incidentes/{id:int}")]
    public async Task<IActionResult> UpdateIncidente(int id, [FromBody] IncidenteDto dto)
    {
        var inc = await _db.Incidentes.FindAsync(id)
                  ?? throw ReglaException.NoEncontrado($"El incidente {id} no existe.");
        // La unidad del incidente no cambia al editar; se validan fecha y descripción.
        await ValidarIncidente(inc, dto with { id_unidad = inc.id_unidad });
        await _db.SaveChangesAsync();
        return Ok(inc);
    }

    private async Task ValidarIncidente(Incidente inc, IncidenteDto dto)
    {
        var unidad = await Reglas.UnidadExistente(_db, dto.id_unidad);
        Reglas.SoloBuses(unidad, "Los incidentes");
        Reglas.V06FechaHoraNoFutura(dto.fecha);
        inc.fecha = new DateTime(dto.fecha.Year, dto.fecha.Month, dto.fecha.Day, dto.fecha.Hour, dto.fecha.Minute, 0);
        inc.descripcion = Reglas.Requerido(dto.descripcion, "descripcion", 300);
    }

    private async Task<UnidadTransporte> BuscarUnidad(int id)
        => await _db.Unidades.FindAsync(id) ?? throw ReglaException.NoEncontrado($"La unidad {id} no existe.");

    private async Task Asignar(UnidadTransporte u, UnidadDto dto, int? id)
    {
        var placa = Reglas.Requerido(Reglas.NormalizarPlaca(dto.placa), "placa", 10);
        await Reglas.V07PlacaUnica(_db, placa, id);

        if (dto.capacidad is < 0) throw new ReglaException("La capacidad no puede ser negativa.");
        var estado = Reglas.Opcional(dto.estado, "estado", 20);
        // «En mantenimiento» se deriva del taller: si la web reenvía el estado mostrado mientras el bus
        // está en taller, se conserva el estado guardado para que no quede fijo al registrar la salida.
        if (id is int idUnidad && string.Equals(estado, Taller.EstadoEnMantenimiento, StringComparison.OrdinalIgnoreCase)
            && await _db.Mantenimientos.Where(m => m.id_unidad == idUnidad).EnTallerEl(HoraPeru.Hoy).AnyAsync())
            estado = u.estado;
        Reglas.V14EstadoBaja(u.activo, estado);

        if (dto.id_usuario is int idUsuario && !await _db.Usuarios.AnyAsync(x => x.id_usuario == idUsuario))
            throw new ReglaException($"El usuario {idUsuario} no existe.");

        u.placa = placa;
        u.tipo = Reglas.Requerido(dto.tipo, "tipo", 30);
        u.marca = Reglas.Requerido(dto.marca, "marca", 50);
        u.modelo = Reglas.Requerido(dto.modelo, "modelo", 50);
        u.codigo_patrimonial = Reglas.Opcional(dto.codigo_patrimonial, "codigo_patrimonial", 30);
        u.capacidad = dto.capacidad is > 0 ? dto.capacidad : null;
        u.estado = estado;
        if (dto.id_usuario is not null) u.id_usuario = dto.id_usuario;
    }
}
