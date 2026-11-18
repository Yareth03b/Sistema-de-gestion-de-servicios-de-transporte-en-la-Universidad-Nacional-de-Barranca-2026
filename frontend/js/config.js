function getLocalTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const CONFIG = {
  // URL base del API en C# (ASP.NET Core) alojada en MonsterASP.NET
  API_BASE_URL: 'https://transporte-unab-api.runasp.net/api',
  REQUEST_TIMEOUT_MS: 6000,
  PREVENTIVE_INTERVAL_KM: 5000,
  get REFERENCE_DATE() {
    return getLocalTodayISO();
  },
};
