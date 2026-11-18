namespace TransporteUnab.Api.Infraestructura;

/// <summary>
/// Fecha y hora oficiales de Perú (UTC-5, sin horario de verano).
/// El servidor de MonsterASP no está necesariamente en Perú, así que
/// no se usa DateTime.Now / DateTime.Today directamente.
/// </summary>
public static class HoraPeru
{
    private static readonly TimeZoneInfo Zona = ObtenerZona();

    private static TimeZoneInfo ObtenerZona()
    {
        foreach (var id in new[] { "America/Lima", "SA Pacific Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("Peru", TimeSpan.FromHours(-5), "Perú", "Perú");
    }

    public static DateTime Ahora => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Zona);
    public static DateTime Hoy => Ahora.Date;
}
