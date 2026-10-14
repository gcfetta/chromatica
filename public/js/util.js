const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const $ = (sel, el = document) => el.querySelector(sel);

async function api(metodo, url, body) {
  const r = await fetch(url, {
    method: metodo, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) {
    const e = new Error(data?.error || 'Error inesperado');
    e.status = r.status; e.data = data;
    if (r.status === 401 && typeof App !== 'undefined') App.sesionVencida();
    throw e;
  }
  return data;
}

let _toastT;
function toast(texto, { error = false, accion = null, onAccion = null } = {}) {
  const t = $('#toast');
  t.className = 'toast' + (error ? ' error' : '');
  t.innerHTML = `<span>${h(texto)}</span>${accion ? `<button id="toast-acc">${h(accion)}</button>` : ''}`;
  t.hidden = false;
  if (accion) $('#toast-acc').onclick = () => { t.hidden = true; onAccion?.(); };
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { t.hidden = true; }, accion ? 7000 : 3500);
}

// Botón de doble clic para acciones delicadas (confirmar sin usar confirm())
function doble(btn, texto, fn) {
  if (btn.dataset.listo) return fn();
  const orig = btn.textContent;
  btn.dataset.listo = '1'; btn.textContent = texto;
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.listo; btn.textContent = orig; } }, 4000);
}
const fdia = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
const hoyISO = () => new Date().toLocaleDateString('en-CA');

function estadoGuardado(ok) {
  const e = $('#estado');
  e.textContent = ok ? 'Todo guardado' : 'No se pudo guardar';
  e.classList.toggle('error', !ok);
}