using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Servicios;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(o => o.InvalidModelStateResponseFactory = RespuestaValidacion.Crear);
builder.Services.AddOpenApi();
builder.Services.AddExceptionHandler<ManejadorErrores>();
builder.Services.AddProblemDetails();
builder.Services.Configure<OpcionesValidacion>(builder.Configuration.GetSection("Validaciones"));

// La cadena real NO está en el repo: en producción viene de appsettings.Production.json
// (subido a MonsterASP) y en local de la variable ConnectionStrings__DefaultConnection.
var conexion = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(conexion))
    throw new InvalidOperationException("Falta la cadena de conexión 'DefaultConnection'.");

builder.Services.AddDbContext<TransporteDbContext>(options =>
    options.UseSqlServer(conexion, sql => sql.EnableRetryOnFailure(3, TimeSpan.FromSeconds(5), null)));

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()
            .WithExposedHeaders("X-Cierres-Recalculados"));
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages(async ctx =>
{
    // 404/405 sin cuerpo (ruta inexistente, método no permitido) → JSON con "message".
    var res = ctx.HttpContext.Response;
    if (res.HasStarted || res.ContentLength > 0) return;
    var message = res.StatusCode switch
    {
        404 => "Recurso no encontrado.",
        405 => "Método HTTP no permitido para esta ruta.",
        415 => "El cuerpo debe enviarse como JSON (Content-Type: application/json).",
        _ => $"Error HTTP {res.StatusCode}."
    };
    await res.WriteAsJsonAsync(new { message, codigo = (string?)null });
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("FrontendPolicy");
app.UseAuthorization();
app.MapControllers();

app.Run();
