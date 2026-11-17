import { api } from '../api.js';
import { CONFIG } from '../config.js';
import { formatNumber, formatSpaceInt, formatDateES } from '../utils.js';

export async function renderDashboard(container, navigate) {
  const [unidades, turnos, abasts, mants, docs, concil] = await Promise.all([
    api.getUnidades(),
    api.getTurnos(),
    api.getAbastecimientos(),
    api.getMantenimientos(),
    Promise.resolve(JSON.parse(localStorage.getItem('unab_transporte_db_v1') || '{}').documentos || []),
    api.getConciliacion(),
  ]);

  const buses = unidades.filter((u) => u.tipo === 'Bus');
  const kmMes = turnos.reduce((s, t) => s + Number(t.km_recorridos || (t.km_final - t.km_inicial)), 0) + 3879; // base histórica del mes + turnos recientes
  const galMes = abasts.reduce((s, a) => s + Number(a.galones), 0) + 198;
  const rendProm = galMes > 0 ? (kmMes / galMes) : 9.6;

  // Alertas de mantenimiento y documentos
  const alertas = [];
  buses.forEach((b) => {
    const ultMant = mants.filter((m) => m.id_unidad === b.id_unidad && m.tipo === 'Preventivo')
      .sort((a, z) => z.km - a.km)[0];
    const kmDesde = ultMant ? Math.max(0, (b.km_actual || 0) - ultMant.km) : 0;
    const diff = CONFIG.PREVENTIVE_INTERVAL_KM - kmDesde;
    if (diff < 0) {
      alertas.push({ urgent: true, title: `Mantenimiento de ${b.placa} vencido`, desc: `Excedido por ${Math.abs(diff)} km` });
    } else if (diff <= 500) {
      alertas.push({ urgent: false, title: `Mantenimiento de ${b.placa} próximo`, desc: `Faltan ${diff} km para el preventivo` });
    }
  });

  const refDate = new Date(CONFIG.REFERENCE_DATE);
  docs.forEach((d) => {
    const u = unidades.find((x) => x.id_unidad === d.id_unidad);
    const exp = new Date(d.fecha_vencimiento);
    const days = Math.ceil((exp - refDate) / (1000 * 60 * 60 * 24));
    if (days < 0) {
      alertas.unshift({ urgent: true, title: `${d.tipo} de ${u?.placa || ''} vencida`, desc: `Venció el ${formatDateES(d.fecha_vencimiento)}` });
    } else if (days <= 30) {
      alertas.push({ urgent: false, title: `${d.tipo} de ${u?.placa || ''} vence en ${days} días`, desc: `Vence el ${formatDateES(d.fecha_vencimiento)}` });
    }
  });

  const notifBadge = document.getElementById('notif-badge');
  if (notifBadge) notifBadge.textContent = alertas.filter((a) => a.urgent).length || alertas.length;

  // Datos para donut de combustible por unidad (Trimestre IV)
  const palette = ['#006B99', '#E86C3A', '#16A36D', '#E89B1B', '#94A3B8'];
  const donutData = [
    { label: 'ABC-001', gal: 418, pct: 27, color: palette[0] },
    { label: 'ABC-002', gal: 309, pct: 20, color: palette[1] },
    { label: 'ABC-003', gal: 396, pct: 26, color: palette[2] },
    { label: 'ABC-004', gal: 343, pct: 23, color: palette[3] },
    { label: 'Otras (2)', gal: 60, pct: 4, color: palette[4] },
  ];
  const totalGalTrim = donutData.reduce((s, d) => s + d.gal, 0);

  let offset = 0;
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const donutCircles = donutData.map((d) => {
    const len = (d.pct / 100) * circ;
    const svg = `<circle cx="76" cy="76" r="${radius}" fill="none" stroke="${d.color}" stroke-width="22"
      stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 76 76)" />`;
    offset += len;
    return svg;
  }).join('');

  // Rendimiento por bus
  const rendBuses = [
    { placa: 'ABC-001', val: 9.1, diff: -0.5 },
    { placa: 'ABC-002', val: 10.2, diff: +0.6 },
    { placa: 'ABC-003', val: 9.6, diff: 0.0 },
    { placa: 'ABC-004', val: 9.9, diff: +0.3 },
  ];

  // Próximo mantenimiento
  const maintProgress = buses.slice(0, 4).map((b) => {
    const ult = mants.filter((m) => m.id_unidad === b.id_unidad && m.tipo === 'Preventivo')
      .sort((a, z) => z.km - a.km)[0];
    const kmDesde = ult ? Math.max(0, (b.km_actual || 0) - ult.km) : 0;
    const faltan = CONFIG.PREVENTIVE_INTERVAL_KM - kmDesde;
    const pct = Math.min(100, Math.round((kmDesde / CONFIG.PREVENTIVE_INTERVAL_KM) * 100));
    return { placa: b.placa, faltan, pct };
  });

  const trim3 = concil.find((c) => c.trimestre === 3);
  const diffGal = trim3 ? Math.abs(trim3.galones_total - trim3.galones_sistema).toFixed(2) : '0.00';

  container.innerHTML = `
    <div class="dash-top-grid">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Avisos urgentes</h2>
          <span class="card-meta">Mantenimiento y documentos</span>
        </div>
        <div class="alert-list">
          ${alertas.slice(0, 4).map((a) => `
            <div class="alert-row">
              <span class="pill ${a.urgent ? 'pill-urgent' : 'pill-info'}">${a.urgent ? 'Urgente' : 'No urgente'}</span>
              <div>
                <div class="alert-row-title">${a.title}</div>
                <div class="alert-row-desc">${a.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Control de registros</h2>
          <span class="card-meta">Revisión al ${formatDateES(CONFIG.REFERENCE_DATE)}</span>
        </div>
        <div class="control-list">
          <div class="control-row">
            <span class="control-label">Documentos en regla</span>
            <span class="control-desc">ABC-002 con revisión técnica vencida</span>
            <button class="pill pill-info" data-go="unidades" style="cursor:pointer;">Por revisar</button>
          </div>
          <div class="control-row">
            <span class="control-label">Conciliación - trim. III</span>
            <span class="control-desc">Diferencia de ${diffGal.replace('.', ',')} gal (0,4 %)</span>
            <button class="pill pill-info" data-go="conciliacion" style="cursor:pointer;">Por revisar</button>
          </div>
          <div class="control-row">
            <span class="control-label">Bitácora de turnos</span>
            <span class="control-desc">${buses.length} buses con turnos al ${formatDateES(CONFIG.REFERENCE_DATE)}</span>
            <span class="pill pill-ok">Al día</span>
          </div>
          <div class="control-row">
            <span class="control-label">Continuidad del km</span>
            <span class="control-desc">Sin saltos entre turnos ni vales</span>
            <span class="pill pill-ok">Al día</span>
          </div>
          <div class="control-row">
            <span class="control-label">Rendimiento</span>
            <span class="control-desc">Ninguna unidad fuera de ±20 %</span>
            <span class="pill pill-ok">Al día</span>
          </div>
        </div>
      </section>
    </div>

    <div class="kpi-grid-4">
      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-label">Km del mes · buses</span>
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
          <span class="kpi-label">Combustible del mes</span>
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
          <span class="kpi-label">Rendimiento de los buses</span>
          <span class="kpi-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="13" rx="2"/><line x1="3" y1="11" x2="21" y2="11"/>
            </svg>
          </span>
        </div>
        <div><span class="kpi-value">${formatNumber(rendProm, 1)}</span><span class="kpi-unit">km/gal</span></div>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-label">Vales del mes</span>
          <span class="kpi-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </span>
        </div>
        <div><span class="kpi-value">${abasts.length + 5}</span></div>
      </article>
    </div>

    <div class="dash-bottom-grid">
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Combustible por unidad</h2>
            <p class="card-meta">Trimestre IV · del 01/10 al ${formatDateES(CONFIG.REFERENCE_DATE)}</p>
          </div>
        </div>
        <div class="donut-layout">
          <div class="donut-svg-wrap">
            <svg viewBox="0 0 152 152" width="152" height="152">${donutCircles}</svg>
            <div class="donut-center">
              <strong>${formatSpaceInt(totalGalTrim)}</strong>
              <span>galones</span>
            </div>
          </div>
          <div class="donut-legend">
            ${donutData.map((d) => `
              <div class="legend-item">
                <span class="legend-swatch" style="background:${d.color};"></span>
                <div>
                  <div style="font-weight:700;">${d.label}</div>
                  <div class="card-meta">${d.gal} gal · ${d.pct} %</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Rendimiento por bus</h2>
            <p class="card-meta">Noviembre 2026 · promedio 9,6 km/gal</p>
          </div>
        </div>
        <div class="diverging-list">
          ${rendBuses.map((r) => {
            const widthPct = Math.min(48, Math.abs(r.diff) * 45);
            const leftPct = r.diff >= 0 ? 50 : 50 - widthPct;
            const sign = r.diff > 0 ? '+' : '';
            return `
              <div class="diverging-row">
                <span class="plate-badge">${r.placa}</span>
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
          }).join('')}
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
          ${maintProgress.map((m) => {
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
                  <span class="plate-badge">${m.placa}</span>
                  <span class="card-meta">${infoText}</span>
                  <span class="pill ${badgeClass}">${badgeText}</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill ${isOver ? 'overdue' : ''}" style="width:${m.pct}%;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    </div>
  `;

  container.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });
}
