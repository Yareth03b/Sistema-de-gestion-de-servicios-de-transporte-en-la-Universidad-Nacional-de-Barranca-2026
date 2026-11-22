using Microsoft.EntityFrameworkCore;
using TransporteUnab.Api.Data;
using TransporteUnab.Api.Infraestructura;
using TransporteUnab.Api.Models;

namespace TransporteUnab.Api.Servicios;

/// <summary>
/// Cálculos que NO se guardan en la BD (decisión 8 y 23): km consumidos y rendimiento.
/// Fórmulas de CONTEXTO_SCRIPT_BD.md, sección 5.
/// </summary>
public static class Calculos
{
    public record ValeCalculado(int? km_consumidos, decimal? rendimiento);

    public record ResumenPeriodo(int km_recorridos, decimal galones, decimal? rendimiento, int km_acumulado,
        int? km_consumidos, decimal galones_rendimiento);

    /// <summary>
    /// Km consumidos (vale) = km_actual − km_actual del vale anterior de la misma unidad
    /// (orden: fecha, km_actual). Rendimiento (vale) = km consumidos ÷ galones.
    /// Sin vale anterior o con 0 galones → null.
    /// </summary>
    public static Dictionary<int, ValeCalculado> PorVale(IEnumerable<Abastecimiento> vales)
    {
        var resultado = new Dictionary<int, ValeCalculado>();
        foreach (var grupo in vales.GroupBy(v => v.id_unidad))
        {
            int? kmAnterior = null;
            foreach (var v in grupo.OrderBy(v => v.fecha).ThenBy(v => v.km_actual).ThenBy(v => v.id_abastecimiento))
            {
                int? km = kmAnterior is int ka ? v.km_actual - ka : null;
                resultado[v.id_abastecimiento] = new ValeCalculado(km, Dividir(km, v.galones));
                kmAnterior = v.km_actual;
            }
        }
        return resultado;
    }

    /// <summary>km ÷ galones redondeado a 2 decimales; null si falta el km o los galones son 0 (sin división entre cero).</summary>
    public static decimal? Dividir(int? km, decimal galones)
        => km is int k && galones > 0 ? Math.Round(k / galones, 2, MidpointRounding.AwayFromZero) : null;

    public static (DateTime inicio, DateTime finExclusivo) RangoTrimestre(int anio, int trimestre)
    {
        var inicio = new DateTime(anio, (trimestre - 1) * 3 + 1, 1);
        return (inicio, inicio.AddMonths(3));
    }

    public static (short anio, byte trimestre) TrimestreDe(DateTime fecha)
        => ((short)fecha.Year, (byte)((fecha.Month - 1) / 3 + 1));

    /// <summary>
    /// Resumen de una unidad en un periodo [inicio, fin), con la MISMA regla que el dashboard (rendimientoFlota):
    /// km_consumidos = Σ km consumidos de los vales del periodo que tienen vale anterior (el anterior puede ser de
    /// antes del periodo o del propio periodo). rendimiento = ese km ÷ galones de esos mismos vales.
    /// Si la unidad tiene un vale antes del inicio, equivale a (último vale del periodo − último vale anterior)
    /// ÷ galones del periodo. El primer vale de una unidad no tiene referencia de km: sus galones no entran en el
    /// rendimiento (galones_rendimiento), pero sí en «galones». Sin vales con referencia → null. No se usa AVG.
    /// km_recorridos = km_consumidos; si es null, los km de la bitácora del periodo (solo buses) o 0.
    /// km_acumulado = mayor km registrado hasta el fin del periodo.
    /// </summary>
    public static async Task<ResumenPeriodo> ResumirPeriodo(TransporteDbContext db, int idUnidad, DateTime inicio, DateTime fin)
    {
        // Historial de vales hasta el fin del periodo: el km consumido de cada vale depende del vale anterior.
        var vales = await db.Abastecimientos.AsNoTracking()
            .Where(a => a.id_unidad == idUnidad && a.fecha < fin)
            .ToListAsync();
        var calculo = PorVale(vales);
        var delPeriodo = vales.Where(a => a.fecha >= inicio).ToList();
        var conReferencia = delPeriodo.Where(a => calculo[a.id_abastecimiento].km_consumidos is not null).ToList();

        var galones = delPeriodo.Sum(a => a.galones);
        int? kmConsumidos = conReferencia.Count > 0 ? conReferencia.Sum(a => calculo[a.id_abastecimiento].km_consumidos!.Value) : null;
        var galonesRendimiento = conReferencia.Sum(a => a.galones);

        var kmBitacora = await db.BitacoraTurnos
            .Where(t => t.id_unidad == idUnidad && t.fecha >= inicio && t.fecha < fin)
            .SumAsync(t => (int?)(t.km_final - t.km_inicial)) ?? 0;

        var kmAcumulado = Math.Max(
            vales.Count > 0 ? vales.Max(a => a.km_actual) : 0,
            await db.BitacoraTurnos.Where(t => t.id_unidad == idUnidad && t.fecha < fin).MaxAsync(t => (int?)t.km_final) ?? 0);

        var rendimiento = Dividir(kmConsumidos, galonesRendimiento);
        if (rendimiento is > 999_999.99m) rendimiento = null; // no cabe en DECIMAL(8,2): dato inválido

        return new ResumenPeriodo(kmConsumidos ?? kmBitacora, galones, rendimiento, kmAcumulado, kmConsumidos, galonesRendimiento);
    }

    /// <summary>
    /// (Re)calcula las filas de CierreUnidad de un cierre: todas las unidades activas y las dadas de baja
    /// que tuvieron vales o turnos en el trimestre (toda la flota entra en el cierre, decisión 1).
    /// No llama a SaveChanges.
    /// </summary>
    public static async Task CalcularCierre(TransporteDbContext db, CierreTrimestral cierre)
    {
        var (inicio, fin) = RangoTrimestre(cierre.anio, cierre.trimestre);

        var ids = await db.Unidades
            .Where(u => u.activo
                || db.Abastecimientos.Any(a => a.id_unidad == u.id_unidad && a.fecha >= inicio && a.fecha < fin)
                || db.BitacoraTurnos.Any(t => t.id_unidad == u.id_unidad && t.fecha >= inicio && t.fecha < fin))
            .Select(u => u.id_unidad)
            .ToListAsync();

        var existentes = cierre.id_cierre == 0
            ? new Dictionary<int, CierreUnidad>()
            : await db.CierresUnidad.Where(cu => cu.id_cierre == cierre.id_cierre).ToDictionaryAsync(cu => cu.id_unidad);

        foreach (var id in ids.Union(existentes.Keys))
        {
            var r = await ResumirPeriodo(db, id, inicio, fin);
            if (!existentes.TryGetValue(id, out var fila))
            {
                fila = new CierreUnidad { id_cierre = cierre.id_cierre, id_unidad = id };
                db.CierresUnidad.Add(fila);
            }
            fila.km_recorridos = r.km_recorridos;
            fila.galones = r.galones;
            fila.rendimiento = r.rendimiento;
            fila.km_acumulado = r.km_acumulado;
        }
    }

    /// <summary>
    /// V-12 / S-05: un trimestre cerrado no bloquea la edición; al registrar o corregir un vale o turno
    /// se recalculan los cierres guardados de los trimestres afectados y de los siguientes
    /// (el km final de un trimestre es la referencia del siguiente). Devuelve los cierres recalculados.
    /// </summary>
    public static async Task<List<string>> RecalcularCierresAfectados(TransporteDbContext db, params DateTime[] fechas)
    {
        if (fechas.Length == 0) return new();
        var (anio, trimestre) = TrimestreDe(fechas.Min());

        var cierres = await db.CierresTrimestrales
            .Where(c => c.anio > anio || (c.anio == anio && c.trimestre >= trimestre))
            .OrderBy(c => c.anio).ThenBy(c => c.trimestre)
            .ToListAsync();

        foreach (var c in cierres) await CalcularCierre(db, c);
        if (cierres.Count > 0) await db.SaveChangesAsync();
        return cierres.Select(c => $"T{c.trimestre}-{c.anio}").ToList();
    }

    /// <summary>Parámetro ?dias de los reportes: "calendario" (por defecto) o "habiles".</summary>
    public static bool EsDiasHabiles(string? dias) => (dias ?? "calendario").Trim().ToLowerInvariant() switch
    {
        "calendario" or "" => false,
        "habiles" or "hábiles" => true,
        _ => throw new ReglaException("El parámetro 'dias' debe ser 'calendario' o 'habiles'.")
    };

    /// <summary>Días entre inicio y fin (inclusive). Hábiles = lunes a viernes (no hay tabla de feriados).</summary>
    public static int ContarDias(DateTime inicio, DateTime fin, bool habiles)
    {
        if (fin < inicio) return 0;
        if (!habiles) return (fin - inicio).Days + 1;
        var n = 0;
        for (var d = inicio; d <= fin; d = d.AddDays(1))
            if (d.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday) n++;
        return n;
    }

    /// <summary>km ÷ días redondeado a 2 decimales; null si no hay días (sin división entre cero).</summary>
    public static decimal? PorDia(int km, int dias)
        => dias > 0 ? Math.Round((decimal)km / dias, 2, MidpointRounding.AwayFromZero) : null;

    /// <summary>Hoy en Perú; usado para la fecha de cierre.</summary>
    public static DateTime Hoy => HoraPeru.Hoy;
}
