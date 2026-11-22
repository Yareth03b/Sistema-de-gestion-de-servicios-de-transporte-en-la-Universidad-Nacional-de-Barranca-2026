using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Servicios;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public DashboardController(TransporteDbContext db) => _db = db;

    [HttpGet("health")]
    public async Task<IActionResult> Health()
    {
        var canConnect = await _db.Database.CanConnectAsync();
        return Ok(new { status = "ok", database = canConnect ? "connected" : "unreachable" });
    }

    /// <summary>
    /// «Buses operativos hoy» (Lima): buses activos cuyo estado DERIVADO es «Operativo».
    /// Un bus en taller hoy cuenta como «En mantenimiento» aunque su estado guardado sea Operativo.
    /// </summary>
    [HttpGet("buses-operativos")]
    public async Task<IActionResult> BusesOperativos()
    {
        var hoy = HoraPeru.Hoy;
        var unidades = await _db.Unidades.AsNoTracking().Where(u => u.activo)
            .Select(u => new { u.id_unidad, u.placa, u.tipo, u.estado }).ToListAsync();
        var buses = unidades.Where(u => u.tipo.Trim().StartsWith("Bus", StringComparison.OrdinalIgnoreCase)).ToList();
        var taller = await Taller.EnTallerPorUnidad(_db, hoy, buses.Select(b => b.id_unidad).ToList());

        var detalle = buses.OrderBy(b => b.placa).Select(b => new
        {
            b.id_unidad,
            b.placa,
            numero_bus = Reglas.NumeroBus(b.placa),
            estado = Taller.EstadoDerivado(true, b.estado, taller.ContainsKey(b.id_unidad)),
            en_taller = taller.ContainsKey(b.id_unidad)
        }).ToList();

        return Ok(new
        {
            fecha = hoy.ToString("yyyy-MM-dd"),
            total_buses = detalle.Count,
            operativos = detalle.Count(b => Reglas.EsOperativo(b.estado)),
            en_taller = detalle.Count(b => b.en_taller),
            buses = detalle
        });
    }
}
