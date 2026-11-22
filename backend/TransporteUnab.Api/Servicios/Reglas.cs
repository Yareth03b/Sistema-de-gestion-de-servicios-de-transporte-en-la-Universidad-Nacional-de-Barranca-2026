using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Servicios;

/// <summary>
/// Parámetros de validación aún no definidos por el cliente (sección "Validaciones" de appsettings).
/// Mientras sean null, V-02 y V-09 no se aplican (decisión 14 y 15 de CONTEXTO_PROYECTO.md).
/// </summary>
public class OpcionesValidacion
{
    /// <summary>V-02: tolerancia en % entre km del turno y km de referencia de las rutas.</summary>
    public decimal? ToleranciaRutaPorcentaje { get; set; }
    /// <summary>V-09: rango normal de rendimiento (km/gal). Fuera del rango = sospechoso.</summary>
    public decimal? RendimientoMinimo { get; set; }
    public decimal? RendimientoMaximo { get; set; }
}

/// <summary>
/// Validaciones V-01 a V-14 (la BD solo valida FK, UNIQUE y algunos CHECK).
/// Cada método lanza ReglaException con el código de la validación.
/// </summary>
public static class Reglas
{
    public const string EstadoOperativo = "Operativo";
    public const string EstadoInactivo = "Inactivo";
    public static readonly string[] TiposMantenimiento = { "Preventivo", "Correctivo", "Predictivo" };
    /// <summary>Estados de SolicitudViaje (CK_SolicitudViaje_Estado). El primero es el inicial.</summary>
    public static readonly string[] EstadosSolicitud = { "Pendiente", "Estimada", "Aprobada", "Rechazada" };

    /// <summary>Normaliza el estado de una solicitud (sin distinguir mayúsculas) o lanza 400.</summary>
    public static string EstadoSolicitud(string? estado)
        => EstadosSolicitud.FirstOrDefault(e => e.Equals(estado?.Trim(), StringComparison.OrdinalIgnoreCase))
           ?? throw new ReglaException($"Estado de solicitud no válido. Use: {string.Join(", ", EstadosSolicitud)}.");

    // ---------- Utilidades ----------

    /// <summary>Bitácora, mantenimiento, documentos, incidentes y estimador son solo para buses (decisión 1, S-01).</summary>
    public static bool EsBus(UnidadTransporte u) => u.tipo.Trim().StartsWith("Bus", StringComparison.OrdinalIgnoreCase);

    public static bool EsOperativo(string? estado) =>
        string.Equals(estado?.Trim(), EstadoOperativo, StringComparison.OrdinalIgnoreCase);

    /// <summary>Número de bus = últimos 3 dígitos de la placa (decisión 4). Null si la placa no tiene 3 dígitos.</summary>
    public static string? NumeroBus(string placa)
    {
        var digitos = new string(placa.Where(char.IsDigit).ToArray());
        return digitos.Length >= 3 ? digitos[^3..] : null;
    }

    public static string NormalizarPlaca(string? placa) => (placa ?? string.Empty).Trim().ToUpperInvariant();

    public static string? Limpiar(string? texto) => string.IsNullOrWhiteSpace(texto) ? null : texto.Trim();

    public static string Requerido(string? texto, string campo, int maximo)
    {
        var t = (texto ?? string.Empty).Trim();
        if (t.Length == 0) throw new ReglaException($"El campo '{campo}' es obligatorio.");
        if (t.Length > maximo) throw new ReglaException($"El campo '{campo}' admite como máximo {maximo} caracteres.");
        return t;
    }

    public static string? Opcional(string? texto, string campo, int maximo)
    {
        var t = Limpiar(texto);
        if (t is not null && t.Length > maximo)
            throw new ReglaException($"El campo '{campo}' admite como máximo {maximo} caracteres.");
        return t;
    }

    public static async Task<UnidadTransporte> UnidadExistente(TransporteDbContext db, int idUnidad)
        => await db.Unidades.FirstOrDefaultAsync(u => u.id_unidad == idUnidad)
           ?? throw new ReglaException($"La unidad {idUnidad} no existe.");

    public static async Task<Conductor> ConductorExistente(TransporteDbContext db, int idConductor)
        => await db.Conductores.FirstOrDefaultAsync(c => c.id_conductor == idConductor)
           ?? throw new ReglaException($"El conductor {idConductor} no existe.");

    public static void SoloBuses(UnidadTransporte u, string modulo)
    {
        if (!EsBus(u))
            throw new ReglaException($"{modulo} solo se registra para buses; la unidad {u.placa} es de tipo '{u.tipo}'.");
    }

    // ---------- V-01, V-05 ----------

    public static void V01KmTurno(int kmInicial, int kmFinal)
    {
        if (kmInicial < 0) throw new ReglaException("El kilometraje inicial no puede ser negativo.", "V-01");
        if (kmFinal <= kmInicial) throw new ReglaException("El kilometraje final debe ser mayor al inicial.", "V-01");
    }

    public static void V05Horas(TimeSpan salida, TimeSpan llegada)
    {
        if (llegada <= salida)
            throw new ReglaException("La hora de llegada debe ser posterior a la hora de salida.", "V-05");
    }

    public static TimeSpan ParseHora(string? hora, string campo)
    {
        if (string.IsNullOrWhiteSpace(hora) ||
            !TimeSpan.TryParse(hora.Trim(), System.Globalization.CultureInfo.InvariantCulture, out var t) ||
            t < TimeSpan.Zero || t >= TimeSpan.FromDays(1))
            throw new ReglaException($"La {campo} no es válida. Use el formato HH:mm.");
        // TIME(0): sin segundos fraccionarios.
        return new TimeSpan(t.Hours, t.Minutes, t.Seconds);
    }

    // ---------- V-02 ----------

    public static async Task V02KmRutas(TransporteDbContext db, OpcionesValidacion op, int kmRecorridos, IEnumerable<int> idsRuta)
    {
        if (op.ToleranciaRutaPorcentaje is not decimal tolerancia) return; // tolerancia sin definir: no se aplica
        var ids = idsRuta.ToList();
        if (ids.Count == 0) return;
        var rutas = await db.Rutas.Where(r => ids.Contains(r.id_ruta)).ToDictionaryAsync(r => r.id_ruta, r => r.km_referencia);
        var referencia = ids.Sum(id => rutas.GetValueOrDefault(id));
        if (referencia <= 0) return;
        var diferencia = Math.Abs(kmRecorridos - referencia) * 100m / referencia;
        if (diferencia > tolerancia)
            throw new ReglaException(
                $"Los km del turno ({kmRecorridos}) difieren {diferencia:0.#} % de los km de referencia de la ruta ({referencia}); la tolerancia es {tolerancia} %.",
                "V-02");
    }

    // ---------- V-03 ----------

    /// <summary>
    /// El km de un turno no puede ser menor que el último registrado de la unidad
    /// (ni mayor que el siguiente, si se registra o corrige un turno atrasado).
    /// Se cruzan turnos (mismo día, por hora) y vales (días distintos).
    /// </summary>
    public static async Task V03KmTurno(TransporteDbContext db, int idUnidad, DateTime fecha, TimeSpan horaSalida,
        int kmInicial, int kmFinal, int? excluirTurno)
    {
        var turnos = db.BitacoraTurnos.Where(t => t.id_unidad == idUnidad && t.id_turno != (excluirTurno ?? 0));

        var prevTurno = await turnos
            .Where(t => t.fecha < fecha || (t.fecha == fecha && t.hora_salida < horaSalida))
            .MaxAsync(t => (int?)t.km_final);
        var prevVale = await db.Abastecimientos
            .Where(a => a.id_unidad == idUnidad && a.fecha < fecha)
            .MaxAsync(a => (int?)a.km_actual);
        var anterior = Max(prevTurno, prevVale);
        if (anterior is int ka && kmInicial < ka)
            throw new ReglaException(
                $"El km inicial ({kmInicial}) no puede ser menor que el último km registrado de la unidad ({ka}).", "V-03");

        var sigTurno = await turnos
            .Where(t => t.fecha > fecha || (t.fecha == fecha && t.hora_salida > horaSalida))
            .MinAsync(t => (int?)t.km_inicial);
        var sigVale = await db.Abastecimientos
            .Where(a => a.id_unidad == idUnidad && a.fecha > fecha)
            .MinAsync(a => (int?)a.km_actual);
        var siguiente = Min(sigTurno, sigVale);
        if (siguiente is int ks && kmFinal > ks)
            throw new ReglaException(
                $"El km final ({kmFinal}) no puede ser mayor que el km de un registro posterior de la unidad ({ks}).", "V-03");
    }

    /// <summary>Igual que V03KmTurno, para el km_actual de un vale de combustible.</summary>
    public static async Task V03KmVale(TransporteDbContext db, int idUnidad, DateTime fecha, int kmActual, int? excluirVale)
    {
        if (kmActual < 0) throw new ReglaException("El kilometraje no puede ser negativo.", "V-03");
        var vales = db.Abastecimientos.Where(a => a.id_unidad == idUnidad && a.id_abastecimiento != (excluirVale ?? 0));

        var anterior = Max(
            await vales.Where(a => a.fecha < fecha).MaxAsync(a => (int?)a.km_actual),
            await db.BitacoraTurnos.Where(t => t.id_unidad == idUnidad && t.fecha < fecha).MaxAsync(t => (int?)t.km_final));
        if (anterior is int ka && kmActual < ka)
            throw new ReglaException(
                $"El km del vale ({kmActual}) no puede ser menor que el último km registrado de la unidad ({ka}).", "V-03");

        var siguiente = Min(
            await vales.Where(a => a.fecha > fecha).MinAsync(a => (int?)a.km_actual),
            await db.BitacoraTurnos.Where(t => t.id_unidad == idUnidad && t.fecha > fecha).MinAsync(t => (int?)t.km_inicial));
        if (siguiente is int ks && kmActual > ks)
            throw new ReglaException(
                $"El km del vale ({kmActual}) no puede ser mayor que el km de un registro posterior de la unidad ({ks}).", "V-03");
    }

    // ---------- V-04 ----------

    public static void V04Galones(decimal galones)
    {
        if (galones <= 0) throw new ReglaException("La cantidad de galones debe ser mayor a 0.", "V-04");
        if (galones > 999_999.99m) throw new ReglaException("La cantidad de galones es demasiado grande.", "V-04");
    }

    // ---------- V-06 ----------

    public static void V06FechaNoFutura(DateTime fecha, string campo = "fecha")
    {
        if (fecha.Date > HoraPeru.Hoy)
            throw new ReglaException($"La {campo} ({fecha:dd/MM/yyyy}) no puede ser futura.", "V-06");
        if (fecha.Year < 2000)
            throw new ReglaException($"La {campo} no es válida.", "V-06");
    }

    public static void V06FechaHoraNoFutura(DateTime fechaHora, string campo = "fecha")
    {
        // 5 minutos de margen por diferencias de reloj con el navegador.
        if (fechaHora > HoraPeru.Ahora.AddMinutes(5))
            throw new ReglaException($"La {campo} ({fechaHora:dd/MM/yyyy HH:mm}) no puede ser futura.", "V-06");
        if (fechaHora.Year < 2000)
            throw new ReglaException($"La {campo} no es válida.", "V-06");
    }

    // ---------- V-07 ----------

    public static async Task V07PlacaUnica(TransporteDbContext db, string placa, int? excluir)
    {
        if (await db.Unidades.AnyAsync(u => u.placa == placa && u.id_unidad != (excluir ?? 0)))
            throw ReglaException.Conflicto($"La placa {placa} ya está registrada.", "V-07");
    }

    public static async Task V07DniUnico(TransporteDbContext db, string dni, int? excluir)
    {
        if (await db.Conductores.AnyAsync(c => c.dni == dni && c.id_conductor != (excluir ?? 0)))
            throw ReglaException.Conflicto($"Ya existe un conductor con DNI {dni}.", "V-07");
    }

    public static async Task V07ValeUnico(TransporteDbContext db, string nroVale, int? excluir)
    {
        if (await db.Abastecimientos.AnyAsync(a => a.nro_vale == nroVale && a.id_abastecimiento != (excluir ?? 0)))
            throw ReglaException.Conflicto($"El número de vale {nroVale} ya existe.", "V-07");
    }

    // ---------- V-08 ----------

    public static string V08Dni(string? dni)
    {
        var d = (dni ?? string.Empty).Trim();
        if (!Regex.IsMatch(d, @"^[0-9]{8}$"))
            throw new ReglaException("El DNI debe tener exactamente 8 dígitos numéricos.", "V-08");
        return d;
    }

    // ---------- V-09 ----------

    public static bool V09Sospechoso(OpcionesValidacion op, decimal? rendimiento)
    {
        if (rendimiento is not decimal r) return false;
        if (op.RendimientoMinimo is decimal min && r < min) return true;
        if (op.RendimientoMaximo is decimal max && r > max) return true;
        return false;
    }

    // ---------- V-10 ----------

    public static void V10Activos(UnidadTransporte u, Conductor c)
    {
        if (!u.activo) throw new ReglaException($"La unidad {u.placa} está dada de baja.", "V-10");
        if (!c.activo) throw new ReglaException($"El conductor {c.nombres} {c.apellidos} está dado de baja.", "V-10");
    }

    // ---------- V-13 ----------

    /// <summary>
    /// El conductor debe pertenecer a la unidad: en un bus, el conductor asignado a ese bus;
    /// en las demás unidades, un conductor sin bus asignado (S-07).
    /// </summary>
    public static void V13ConductorDeUnidad(Conductor c, UnidadTransporte u)
    {
        if (EsBus(u))
        {
            if (c.id_unidad != u.id_unidad)
                throw new ReglaException(
                    $"El conductor {c.nombres} {c.apellidos} no está asignado al bus {u.placa}. Actualice su asignación en Conductores.",
                    "V-13");
        }
        else if (c.id_unidad is not null)
        {
            throw new ReglaException(
                $"El conductor {c.nombres} {c.apellidos} está asignado a un bus; para la unidad {u.placa} use un conductor sin bus asignado.",
                "V-13");
        }
    }

    // ---------- V-14 ----------

    public static void V14EstadoBaja(bool activo, string? estado)
    {
        if (!activo && EsOperativo(estado))
            throw new ReglaException("Una unidad dada de baja no puede tener estado operativo.", "V-14");
    }

    private static int? Max(int? a, int? b) => a is null ? b : b is null ? a : Math.Max(a.Value, b.Value);
    private static int? Min(int? a, int? b) => a is null ? b : b is null ? a : Math.Min(a.Value, b.Value);
}
