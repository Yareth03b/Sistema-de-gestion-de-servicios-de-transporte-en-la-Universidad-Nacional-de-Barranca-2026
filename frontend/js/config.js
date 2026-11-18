const relojPeru = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export const CONFIG = {
  // URL base del API en C# (ASP.NET Core) alojada en MonsterASP.NET
  API_BASE_URL: 'https://transporte-unab-api.runasp.net/api',
  REQUEST_TIMEOUT_MS: 20000,
  PREVENTIVE_INTERVAL_KM: 5000,
  get REFERENCE_DATE() {
    return this.REFERENCE_DATETIME.slice(0, 10);
  },
  get REFERENCE_DATETIME() {
    return relojPeru.format(new Date()).replace(' ', 'T');
  },
};
