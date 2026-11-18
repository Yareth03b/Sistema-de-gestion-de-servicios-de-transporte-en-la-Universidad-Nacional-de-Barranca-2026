export function formatNumber(n, decimals = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const num = Number(n || 0);
  return num.toLocaleString('es-PE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSpaceInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Math.round(Number(n || 0))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatDateES(isoDate) {
  if (!isoDate) return '-';
  const clean = isoDate.toString().slice(0, 10);
  const [y, m, d] = clean.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3200);
}

export function openModal({ title, bodyHtml, onMount }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">${escapeHtml(title)}</h2>
          <button type="button" class="modal-close" id="modal-close-btn" aria-label="Cerrar">×</button>
        </div>
        <div id="modal-body">${bodyHtml}</div>
      </div>
    </div>
  `;
  const close = () => { root.innerHTML = ''; };
  document.getElementById('modal-close-btn').addEventListener('click', close);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') close();
  });
  if (onMount) onMount(close);
  return close;
}

export function esBus(u) {
  return u?.tipo?.trim().toLowerCase().startsWith('bus') ?? false;
}

export function rendimientoPeriodo(vales) {
  const galones = vales.reduce((total, vale) => total + vale.galones, 0);
  if (galones <= 0 || vales.some(vale => vale.km_consumidos == null)) return null;
  return vales.reduce((total, vale) => total + (vale.km_consumidos ?? 0), 0) / galones;
}
