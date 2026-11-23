import { api } from '../api.js?v=11';
import { prepararCampos, errorCampo, showToast } from '../utils.js?v=11';

const SESSION_KEY = 'unab_transporte_session';

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function initAuth(onLoginSuccess, onLogout) {
  const form = document.getElementById('login-form');
  const userInput = document.getElementById('login-usuario');
  const passInput = document.getElementById('login-password');
  const remember = document.getElementById('login-remember');
  const cargarUsuarioRecordado = () => {
    const guardado = localStorage.getItem('unab_usuario_recordado');
    userInput.value = guardado || '';
    remember.checked = Boolean(guardado);
  };
  cargarUsuarioRecordado();
  remember.addEventListener('change', () => {
    if (!remember.checked) localStorage.removeItem('unab_usuario_recordado');
  });
  const toggleBtn = document.getElementById('toggle-password-btn');
  const errEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');
  const logoutBtn = document.getElementById('logout-btn');

  prepararCampos(form);
  toggleBtn.addEventListener('click', () => {
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const usuario = userInput.value.trim();
    const contrasenia = passInput.value;
    if (!usuario || !contrasenia) {
      if (!usuario) errorCampo(userInput, 'Ingresa tu usuario.');
      if (!contrasenia) errorCampo(passInput, 'Ingresa tu contraseña.');
      (usuario ? passInput : userInput).focus();
      errEl.textContent = 'Ingresa tu usuario y contraseña.';
      errEl.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    try {
      const session = await api.login(usuario, contrasenia);
      if (remember.checked) localStorage.setItem('unab_usuario_recordado', usuario);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      showToast(`Bienvenido, ${session.nombre_completo}`, 'success');
      onLoginSuccess(session);
    } catch (err) {
      errEl.textContent = err.message || 'Credenciales inválidas.';
      errEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    const session = getSession();
    try {
      if (session?.id_sesion) await api.logout(session.id_sesion);
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
    clearSession();
    form.reset();
    cargarUsuarioRecordado();
    onLogout();
  });
}
