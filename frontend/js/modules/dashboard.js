import { api } from '../api.js?v=11';
import { CONFIG } from '../config.js?v=11';

import { esBus, rendimientoPeriodo, rendimientoFlota, formatNumber, formatSpaceInt, formatDateES, escapeHtml } from '../utils.js?v=11';

export async function renderDashboard(container, navigate) {
  let mantenimientoError = '';
  let busesOperativosError = '';
  const [unidades, todosTurnos, todosVales, listado, concil, operatividad] = await Promise.all([
    api.getUnidades(),
    api.getTurnos(),
    api.getAbastecimientos(),
    api.getMantenimientos().catch(err => { mantenimientoError = err.message; return null; }),
    api.getConciliacion(),
    api.getBusesOperativos().catch(err => { busesOperativosError = err.message; return null; }),
  ]);
  const historiales = await Promise.all(unidades.map(u => api.getUnidadHistorial(u.id_unidad)));
  const mants = listado ?? historiales.flatMap(h => h.mantenimientos);
  const docs = historiales.flatMap(h => h.documentos);
  const mes = CONFIG.REFERENCE_DATE.slice(0, 7);
  const turnos = todosTurnos.filter(t => t.fecha?.startsWith(mes));
  const abasts = todosVales.filter(a => a.fecha?.startsWith(mes));

  const kmMes = turnos.reduce((s, t) => s + Number(t.km_recorridos || (t.km_final - t.km_inicial)), 0);
  const galMes = abasts.reduce((s, a) => s + Number(a.galones), 0);
  const rendProm = rendimientoFlota(abasts);
  const buses = unidades.filter((u) => u.activo !== false && esBus(u));
  const operatividadCalculada = {
    total_buses: buses.length,
    operativos: buses.filter((b) => !b.en_taller && (b.estado || '').trim().toLowerCase() === 'operativo').length,
  };
  const busesOperativosHoy = operatividad ?? operatividadCalculada;


  // Alertas dinámicas de mantenimiento y documentos
  const alertas = [];
  unidades.forEach((u) => {
    const ultMant = mants
      .filter((m) => m.id_unidad === u.id_unidad && m.tipo === 'Preventivo')
      .sort((a, z) => z.km - a.km)[0];
    if (ultMant) {
      const kmDesde = Math.max(0, (u.km_actual || 0) - ultMant.km);
      const diff = CONFIG.PREVENTIVE_INTERVAL_KM - kmDesde;
      if (diff < 0) {
        alertas.push({ urgent: true, title: `Mantenimiento de ${u.placa} vencido`, desc: `Excedido por ${Math.abs(diff)} km` });
      } else if (diff <= 500) {
        alertas.push({ urgent: false, title: `Mantenimiento de ${u.placa} próximo`, desc: `Faltan ${diff} km para el preventivo` });
      }
    }
  });

  const today = new Date();
  docs.forEach((d) => {
    const u = unidades.find((x) => x.id_unidad === d.id_unidad);
    const exp = new Date(d.fecha_vencimiento);
    const days = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    if (days < 0) {
      alertas.unshift({ urgent: true, title: `${d.tipo} de ${u?.placa || ''} vencida`, desc: `Venció el ${formatDateES(d.fecha_vencimiento)}` });
    } else if (days <= 30) {
      alertas.push({ urgent: false, title: `${d.tipo} de ${u?.placa || ''} vence en ${days} días`, desc: `Vence el ${formatDateES(d.fecha_vencimiento)}` });
    }
  });

  const notifBadge = document.getElementById('notif-badge');
  if (notifBadge) notifBadge.textContent = alertas.length;

  // Donut dinámico de combustible por unidad
  const palette = ['#006B99', '#E86C3A', '#16A36D', '#E89B1B', '#94A3B8'];
  const totalGal = abasts.reduce((s, a) => s + Number(a.galones), 0);
  const byUnit = unidades.map((u) => ({
    label: u.placa,
    gal: abasts.filter((a) => a.id_unidad === u.id_unidad).reduce((s, a) => s + Number(a.galones), 0),
  })).filter((x) => x.gal > 0).sort((a, b) => b.gal - a.gal);

  const donutData = byUnit.slice(0, 4).map((d, i) => ({
    ...d,
    pct: totalGal > 0 ? Math.round((d.gal / totalGal) * 100) : 0,
    color: palette[i],
  }));
  if (byUnit.length > 4) {
    const restGal = byUnit.slice(4).reduce((s, x) => s + x.gal, 0);
    donutData.push({
      label: `Otras (${byUnit.length - 4})`,
      gal: restGal,
      pct: totalGal > 0 ? Math.round((restGal / totalGal) * 100) : 0,
      color: palette[4],
    });
  }

  let offset = 0;
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const donutCircles = donutData.length
    ? donutData.map((d) => {
        const len = (d.pct / 100) * circ;
        const svg = `<circle cx="76" cy="76" r="${radius}" fill="none" stroke="${d.color}" stroke-width="22"
          stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 76 76)" />`;
        offset += len;
        return svg;
      }).join('')
    : `<circle cx="76" cy="76" r="${radius}" fill="none" stroke="#E2E8F0" stroke-width="22" />`;

  // Rendimiento dinámico por unidad
  const rendUnidades = unidades.slice(0, 4).map((u) => {
    const vales = abasts.filter(a => a.id_unidad === u.id_unidad);
    const val = rendimientoPeriodo(vales);
    if (val == null || rendProm == null) return null;
    return { placa: u.placa, val, diff: +(val - rendProm).toFixed(1) };
  }).filter(Boolean);

  // Próximo mantenimiento dinámico
  const maintProgress = unidades.slice(0, 4).map((u) => {
    const ult = mants.filter((m) => m.id_unidad === u.id_unidad && m.tipo === 'Preventivo')
      .sort((a, z) => z.km - a.km)[0];
    const kmDesde = ult ? Math.max(0, (u.km_actual || 0) - ult.km) : 0;
    const faltan = CONFIG.PREVENTIVE_INTERVAL_KM - kmDesde;
    const pct = Math.min(100, Math.round((kmDesde / CONFIG.PREVENTIVE_INTERVAL_KM) * 100));
    return { placa: u.placa, faltan, pct };
  });

  const docsVencidos = docs.filter((d) => new Date(d.fecha_vencimiento) < today).length;
  const ultConc = concil[0];
  const diffConc = ultConc ? Math.abs(Number(ultConc.galones_total) - Number(ultConc.galones_sistema || 0)) : 0;

  if (!container.isConnected) return;

  container.innerHTML = `
    ${mantenimientoError ? `<p role="alert">Listado de mantenimiento no disponible. Se usaron los historiales de las unidades activas. ${escapeHtml(mantenimientoError)}</p>` : ''}
    ${busesOperativosError ? `<p role="alert">Operatividad de buses no disponible. Se calculó a partir de la lista de unidades. ${escapeHtml(busesOperativosError)}</p>` : ''}
    <div class="dash-top-grid">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Avisos urgentes</h2>
          <span class="card-meta">Mantenimiento y documentos</span>
        </div>
        <div class="alert-list">
          ${alertas.length ? alertas.slice(0, 4).map((a) => `
            <div class="alert-row">
              <span class="pill ${a.urgent ? 'pill-urgent' : 'pill-info'}">${a.urgent ? 'Urgente' : 'No urgente'}</span>
              <div>
                <div class="alert-row-title">${escapeHtml(a.title)}</div>
                <div class="alert-row-desc">${escapeHtml(a.desc)}</div>
              </div>
            </div>
          `).join('') : `<p class="card-meta" style="padding:12px 0;">No hay avisos pendientes. Registra unidades, mantenimientos y documentos para monitorearlos aquí.</p>`}
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Control de registros</h2>
          <span class="card-meta">Estado actual del sistema</span>
        </div>
        <div class="control-list">
          <div class="control-row">
            <span class="control-label">Unidades registradas</span>
            <span class="control-desc">${unidades.length} unidades activas en flota</span>
            <button class="pill ${unidades.length ? 'pill-ok' : 'pill-info'}" data-go="unidades" style="cursor:pointer;">${unidades.length ? 'Ver flota' : 'Agregar'}</button>
          </div>
          <div class="control-row">
            <span class="control-label">Documentos en regla</span>
            <span class="control-desc">${docsVencidos ? `${docsVencidos} documento(s) vencido(s)` : `${docs.length} documento(s) vigentes`}</span>
            <button class="pill ${docsVencidos ? 'pill-info' : 'pill-ok'}" data-go="unidades" style="cursor:pointer;">${docsVencidos ? 'Por revisar' : 'Al día'}</button>
          </div>
          <div class="control-row">
            <span class="control-label">Conciliación grifo</span>
            <span class="control-desc">${ultConc ? `Diferencia de ${formatNumber(diffConc, 2)} gal` : 'Sin reportes de grifo registrados'}</span>
            <button class="pill ${diffConc > 0.5 ? 'pill-info' : 'pill-ok'}" data-go="conciliacion" style="cursor:pointer;">${!ultConc ? 'Sin reporte' : diffConc > 0.5 ? 'Por revisar' : 'Al día'}</button>
          </div>
          <div class="control-row">
            <span class="control-label">Bitácora de turnos</span>
            <span class="control-desc">${turnos.length} turno(s) registrados</span>
            <button class="pill pill-ok" data-go="turnos" style="cursor:pointer;">Ver bitácora</button>
          </div>
        </div>
      </section>
    </div>

    <div class="kpi-grid-4">
      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-label">Km recorridos</span>
          <span class="kpi-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </span>
        </div>
        <div><span class="kpi-value">${formatSpaceInt(kmMes)}</span><span class="kpi-unit">km</span></div>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-label">Combustible registrado</span>
          <span class="kpi-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>
              <path d="M15 10h2a2 2 0 0 1 2 2v5a2 2 0 0 0 4 0V9l-3-3"/>
            </svg>
          </span>
        </div>
        <div><span class="kpi-value">${formatNumber(galMes, 2)}</span><span class="kpi-unit">gal</span></div>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-label">Rendimiento del mes</span>
          <span class="kpi-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="13" rx="2"/><line x1="3" y1="11" x2="21" y2="11"/>
            </svg>
          </span>
        </div>
        <div><span class="kpi-value">${formatNumber(rendProm, 1)}</span><span class="kpi-unit">km/gal</span></div>
      </article>

      <article class="kpi-card" data-go="unidades" style="cursor:pointer;" title="Ver flota de buses">
        <div class="kpi-head">
          <span class="kpi-label">Buses operativos hoy</span>
          <span class="kpi-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="13" rx="2"/><line x1="3" y1="11" x2="21" y2="11"/>
              <circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>
            </svg>
          </span>
        </div>
        <div><span class="kpi-value">${busesOperativosHoy.operativos}</span>${busesOperativosHoy.total_buses ? `<span class="kpi-unit">/ ${busesOperativosHoy.total_buses}</span>` : ''}</div>
      </article>
    </div>

    <div class="dash-bottom-grid">
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Combustible por unidad</h2>
            <p class="card-meta">Distribución según vales registrados</p>
          </div>
        </div>
        <div class="donut-layout">
          <div class="donut-svg-wrap">
            <svg viewBox="0 0 152 152" width="152" height="152">${donutCircles}</svg>
            <div class="donut-center">
              <strong>${formatNumber(totalGal, 1)}</strong>
              <span>galones</span>
            </div>
          </div>
          <div class="donut-legend">
            ${donutData.length ? donutData.map((d) => `
              <div class="legend-item">
                <span class="legend-swatch" style="background:${d.color};"></span>
                <div>
                  <div style="font-weight:700;">${escapeHtml(d.label)}</div>
                  <div class="card-meta">${formatNumber(d.gal, 1)} gal · ${d.pct} %</div>
                </div>
              </div>
            `).join('') : `<p class="card-meta">Sin abastecimientos aún.</p>`}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Rendimiento por unidad</h2>
            <p class="card-meta">Promedio general ${formatNumber(rendProm, 1)} km/gal</p>
          </div>
        </div>
        <div class="diverging-list">
          ${rendUnidades.length ? rendUnidades.map((r) => {
            const widthPct = Math.min(48, Math.abs(r.diff) * 15);
            const leftPct = r.diff >= 0 ? 50 : 50 - widthPct;
            const sign = r.diff > 0 ? '+' : '';
            return `
              <div class="diverging-row">
                <span class="plate-badge">${escapeHtml(r.placa)}</span>
                <div class="diverging-track">
                  <div class="diverging-center-line"></div>
                  <div class="diverging-bar" style="left:${leftPct}%;width:${Math.max(3, widthPct)}%;"></div>
                </div>
                <div class="num-right">
                  <strong>${formatNumber(r.val, 1)}</strong>
                  <span class="card-meta"> ${sign}${formatNumber(r.diff, 1)}</span>
                </div>
              </div>
            `;
          }).join('') : `<p class="card-meta">Registra unidades, turnos y vales para calcular el rendimiento.</p>`}
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Próximo mantenimiento</h2>
            <p class="card-meta">Km desde el último preventivo</p>
          </div>
        </div>
        <div class="maint-progress-list">
          ${maintProgress.length ? maintProgress.map((m) => {
            const isOver = m.faltan < 0;
            const isSoon = m.faltan >= 0 && m.faltan <= 500;
            const badgeClass = isOver ? 'pill-urgent' : isSoon ? 'pill-info' : 'pill-ok';
            const badgeText = isOver ? 'Vencido' : isSoon ? 'Próximo' : 'Al día';
            const infoText = isOver
              ? `Excedido por ${formatSpaceInt(Math.abs(m.faltan))} km`
              : `Faltan ${formatSpaceInt(m.faltan)} km`;
            return `
              <div>
                <div class="maint-progress-head">
                  <span class="plate-badge">${escapeHtml(m.placa)}</span>
                  <span class="card-meta">${infoText}</span>
                  <span class="pill ${badgeClass}">${badgeText}</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill ${isOver ? 'overdue' : ''}" style="width:${m.pct}%;"></div>
                </div>
              </div>
            `;
          }).join('') : `<p class="card-meta">Sin unidades registradas.</p>`}
        </div>
      </section>
    </div>
  `;

  container.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });
}
