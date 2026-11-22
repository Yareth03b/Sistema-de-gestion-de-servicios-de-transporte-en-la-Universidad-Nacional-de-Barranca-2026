using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace TransporteUnab.Api.Infraestructura;

/// <summary>
/// Error de negocio con código HTTP y, si aplica, el código de validación (V-01 … V-14).
/// La web muestra el campo "message".
/// </summary>
public class ReglaException : Exception
{
    public int Status { get; }
    public string? Codigo { get; }

    public ReglaException(string message, string? codigo = null, int status = StatusCodes.Status400BadRequest)
        : base(message)
    {
        Status = status;
        Codigo = codigo;
    }

    public static ReglaException NoEncontrado(string message) => new(message, null, StatusCodes.Status404NotFound);
    public static ReglaException Conflicto(string message, string? codigo = null) => new(message, codigo, StatusCodes.Status409Conflict);
}

/// <summary>
/// Convierte cualquier excepción en una respuesta JSON { message, codigo? }.
/// Nunca devuelve trazas ni cadenas de conexión al cliente.
/// </summary>
public class ManejadorErrores : IExceptionHandler
{
    private readonly ILogger<ManejadorErrores> _log;
    public ManejadorErrores(ILogger<ManejadorErrores> log) => _log = log;

    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, message, codigo) = Traducir(ex);

        if (status >= 500)
            _log.LogError(ex, "Error no controlado en {Metodo} {Ruta}", ctx.Request.Method, ctx.Request.Path);
        else
            _log.LogInformation("Solicitud rechazada ({Status}) en {Ruta}: {Mensaje}", status, ctx.Request.Path, message);

        ctx.Response.StatusCode = status;
        await ctx.Response.WriteAsJsonAsync(new { message, codigo }, ct);
        return true;
    }

    private static (int status, string message, string? codigo) Traducir(Exception ex)
    {
        switch (ex)
        {
            case ReglaException r:
                return (r.Status, r.Message, r.Codigo);

            case DbUpdateException { InnerException: SqlException sql }:
                return TraducirSql(sql);

            case SqlException sql:
                return TraducirSql(sql);

            case BadHttpRequestException bad:
                return (bad.StatusCode, "La solicitud no es válida.", null);

            default:
                return (StatusCodes.Status500InternalServerError,
                    "Ocurrió un error interno en el servidor. Intente nuevamente.", null);
        }
    }

    private static (int, string, string?) TraducirSql(SqlException sql)
    {
        var m = sql.Message;
        return sql.Number switch
        {
            2627 or 2601 when m.Contains("UQ_UnidadTransporte_Placa") => (409, "La placa ya está registrada.", "V-07"),
            2627 or 2601 when m.Contains("UQ_Conductor_Dni") => (409, "Ya existe un conductor con ese DNI.", "V-07"),
            2627 or 2601 when m.Contains("UQ_Abastecimiento_NroVale") => (409, "El número de vale ya existe.", "V-07"),
            2627 or 2601 when m.Contains("CierreTrimestral") => (409, "Ese trimestre ya fue cerrado.", null),
            2627 or 2601 when m.Contains("ReporteGrifo") => (409, "Ya existe un reporte del grifo para ese trimestre.", null),
            2627 or 2601 => (409, "El registro ya existe (valor duplicado).", null),
            547 when m.Contains("CK_BitacoraTurno_Km") => (400, "El kilometraje final debe ser mayor al inicial.", "V-01"),
            547 when m.Contains("CK_BitacoraTurno_Horas") => (400, "La hora de llegada debe ser posterior a la de salida.", "V-05"),
            547 when m.Contains("CK_Abastecimiento_Galones") => (400, "La cantidad de galones debe ser mayor a 0.", "V-04"),
            547 when m.Contains("CK_Conductor_Dni") => (400, "El DNI debe tener exactamente 8 dígitos numéricos.", "V-08"),
            547 when m.Contains("CK_Mantenimiento_Salida") => (400, "La fecha de salida del taller no puede ser anterior a la de ingreso.", null),
            547 when m.Contains("CK_") => (400, "Los datos no cumplen una regla de la base de datos.", null),
            547 when m.Contains("DELETE") => (409, "No se puede eliminar: el registro tiene historial asociado.", "V-11"),
            547 => (400, "Uno de los registros relacionados no existe.", null),
            8152 or 2628 => (400, "Uno de los textos supera la longitud permitida.", null),
            -2 or 53 or 4060 or 18456 => (503, "No hay conexión con la base de datos. Intente más tarde.", null),
            _ => (500, "Error de base de datos. Intente nuevamente.", null),
        };
    }
}

public static class RespuestaValidacion
{
    /// <summary>
    /// Errores de formato del cuerpo (tipos, campos obligatorios): 400 con
    /// { message, codigo: null, errors } en lugar del ProblemDetails por defecto.
    /// </summary>
    public static IActionResult Crear(ActionContext ctx)
    {
        // El parámetro de la acción (p. ej. "dto", "req") solo dice "cuerpo requerido": se omite si hay errores más concretos.
        var parametros = ctx.ActionDescriptor.Parameters.Select(p => p.Name).ToHashSet();
        var entradas = ctx.ModelState.Where(kv => kv.Value?.Errors.Count > 0).ToList();
        if (entradas.Count > 1) entradas = entradas.Where(kv => !parametros.Contains(kv.Key)).ToList();

        var errores = entradas.ToDictionary(
            kv => Campo(kv.Key, parametros),
            kv => kv.Value!.Errors.Select(e => Traducir(e)).ToArray());

        var primero = errores.FirstOrDefault();
        var message = primero.Key switch
        {
            null => "La solicitud no es válida.",
            "body" => char.ToUpper(primero.Value.First()[0]) + primero.Value.First()[1..],
            _ => $"El campo '{primero.Key}' no es válido: {primero.Value.First()}"
        };

        return new BadRequestObjectResult(new { message, codigo = (string?)null, errors = errores });
    }

    private static string Campo(string clave, HashSet<string> parametros)
    {
        var c = clave.TrimStart('$', '.');
        return string.IsNullOrEmpty(c) || parametros.Contains(c) ? "body" : c;
    }

    private static string Traducir(Microsoft.AspNetCore.Mvc.ModelBinding.ModelError e)
    {
        var m = e.ErrorMessage ?? string.Empty;
        if (e.Exception is System.Text.Json.JsonException || m.Contains("invalid start") || m.Contains("is invalid after")
            || m.Contains("Expected") && m.Contains("LineNumber"))
            return "El cuerpo de la solicitud no es un JSON válido.";
        if (m.Contains("could not be converted")) return "tipo de dato incorrecto.";
        if (m.Contains("field is required") || m.Contains("non-empty request body")) return "falta el dato o el cuerpo de la solicitud.";
        if (m.Contains("missing required properties")) return "faltan campos obligatorios.";
        return string.IsNullOrWhiteSpace(m) ? "valor no válido." : m;
    }
}
