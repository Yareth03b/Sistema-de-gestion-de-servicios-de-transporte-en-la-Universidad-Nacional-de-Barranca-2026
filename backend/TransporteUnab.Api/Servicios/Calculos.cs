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
        int? km_consumidos);

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
    /// Resumen de una unidad en un periodo [inicio, fin):
    /// rendimiento = (km_actual del último vale del periodo − km_actual del último vale ANTERIOR al inicio)
    ///               ÷ galones del periodo. Sin vale anterior o sin galones → null. No se usa AVG.
    /// km_recorridos = esos km consumidos; si no se pueden calcular (sin vale anterior), los km de la
    /// bitácora del periodo (solo buses) o 0. km_acumulado = mayor km registrado hasta el fin del periodo.
    /// </summary>
    public static async Task<ResumenPeriodo> ResumirPeriodo(TransporteDbContext db, int idUnidad, DateTime inicio, DateTime fin)
    {
        var ultimoDelPeriodo = await db.Abastecimientos
            .Where(a => a.id_unidad == idUnidad && a.fecha >= inicio && a.fecha < fin)
            .OrderByDescending(a => a.fecha).ThenByDescending(a => a.km_actual)
            .Select(a => (int?)a.km_actual).FirstOrDefaultAsync();
        var ultimoAnterior = await db.Abastecimientos
            .Where(a => a.id_unidad == idUnidad && a.fecha < inicio)
            .OrderByDescending(a => a.fecha).ThenByDescending(a => a.km_actual)
            .Select(a => (int?)a.km_actual).FirstOrDefaultAsync();
        var galones = await db.Abastecimientos
            .Where(a => a.id_unidad == idUnidad && a.fecha >= inicio && a.fecha < fin)
            .SumAsync(a => (decimal?)a.galones) ?? 0m;

        int? kmConsumidos = ultimoDelPeriodo is int u && ultimoAnterior is int p ? u - p : null;

        var kmBitacora = await db.BitacoraTurnos
            .Where(t => t.id_unidad == idUnidad && t.fecha >= inicio && t.fecha < fin)
            .SumAsync(t => (int?)(t.km_final - t.km_inicial)) ?? 0;

        var kmAcumulado = Math.Max(
            await db.Abastecimientos.Where(a => a.id_unidad == idUnidad && a.fecha < fin).MaxAsync(a => (int?)a.km_actual) ?? 0,
            await db.BitacoraTurnos.Where(t => t.id_unidad == idUnidad && t.fecha < fin).MaxAsync(t => (int?)t.km_final) ?? 0);

        var rendimiento = Dividir(kmConsumidos, galones);
        if (rendimiento is > 999_999.99m) rendimiento = null; // no cabe en DECIMAL(8,2): dato inválido

        return new ResumenPeriodo(kmConsumidos ?? kmBitacora, galones, rendimiento, kmAcumulado, kmConsumidos);
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

    /// <summary>Hoy en Perú; usado para la fecha de cierre.</summary>
    public static DateTime Hoy => HoraPeru.Hoy;
}
