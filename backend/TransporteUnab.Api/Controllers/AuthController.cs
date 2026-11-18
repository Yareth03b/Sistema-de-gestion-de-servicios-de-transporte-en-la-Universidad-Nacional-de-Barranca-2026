using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly TransporteDbContext _db;
    public AuthController(TransporteDbContext db) => _db = db;

    public record LoginRequest(string nombre_usuario, string contrasenia);
    public record LogoutRequest(int id_sesion);

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.nombre_usuario) || string.IsNullOrEmpty(req.contrasenia))
            throw new ReglaException("Ingrese usuario y contraseña.");

        // PENDIENTE (seguridad, fuera de alcance): la contraseña se compara en texto plano.
        var user = await _db.Usuarios
            .Include(u => u.Rol)
            .FirstOrDefaultAsync(u => u.nombre_usuario == req.nombre_usuario.Trim() && u.contrasenia == req.contrasenia && u.activo);

        if (user is null)
            return Unauthorized(new { message = "Usuario o contraseña incorrectos." });

        var sesion = new RegistroSesion
        {
            id_usuario = user.id_usuario,
            fecha_hora_inicio = HoraPeru.Ahora
        };
        _db.RegistrosSesion.Add(sesion);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            user.id_usuario,
            user.nombre_usuario,
            nombre_completo = $"{user.nombres} {user.apellidos}",
            rol = user.Rol?.nombre_rol ?? "Operador",
            sesion.id_sesion
        });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest req)
    {
        var sesion = await _db.RegistrosSesion.FindAsync(req.id_sesion);
        if (sesion is not null && sesion.fecha_hora_salida is null)
        {
            // CK_RegistroSesion_Fechas: salida >= inicio (el inicio pudo grabarse con otro reloj).
            var ahora = HoraPeru.Ahora;
            sesion.fecha_hora_salida = ahora < sesion.fecha_hora_inicio ? sesion.fecha_hora_inicio : ahora;
            await _db.SaveChangesAsync();
        }
        return NoContent();
    }
}
