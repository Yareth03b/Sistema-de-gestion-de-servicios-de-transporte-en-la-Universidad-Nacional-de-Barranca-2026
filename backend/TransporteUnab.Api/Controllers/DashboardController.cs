using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;

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
}
