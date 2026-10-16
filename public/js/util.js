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

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Cierra un modal o panel lateral y lo deja en blanco (la próxima vez que se abra arranca limpio)
function cerrarCapa(capa) {
  if (capa.alCerrar) { const fn = capa.alCerrar; capa.alCerrar = null; fn(); }   // antes de vaciarlo, por si hay que leer sus campos
  capa.hidden = true; capa.innerHTML = '';
}

// Buscador de clienta en un solo campo: al escribir aparecen las coincidencias (nombre o contacto);
// al elegir una queda en el campo y se puede limpiar con la ×.
function selectorClienta(cont, { valor = null, onCambio = () => {} } = {}) {
  let sel = valor, timer;
  cont.classList.add('combo');
  cont.innerHTML = '<input type="text" autocomplete="off" placeholder="Buscar por nombre o contacto"><button type="button" class="combo-x" title="Limpiar" hidden>×</button><div class="combo-lista" hidden></div>';
  const inp = cont.querySelector('input'), x = cont.querySelector('.combo-x'), lista = cont.querySelector('.combo-lista');
  const pintar = () => { inp.value = sel ? sel.nombre : ''; inp.readOnly = !!sel; cont.classList.toggle('elegida', !!sel); x.hidden = !sel; lista.hidden = true; };
  async function buscar() {
    const q = inp.value.trim(); x.hidden = !q;
    if (!q) { lista.hidden = true; return; }
    const r = await api('GET', `/api/clientes?q=${encodeURIComponent(q)}&limite=6`);
    if (inp.value.trim() !== q) return;            // llegó una respuesta vieja
    lista.innerHTML = r.map((c) => `<button type="button" data-id="${c.id}" data-n="${h(c.nombre)}">${h(c.nombre)}${c.contacto ? `<small>${h(c.contacto)}</small>` : ''}</button>`).join('')
      + `<button type="button" data-nueva="1">＋ Crear clienta «${h(q)}»</button>`;
    lista.hidden = false;
  }
  inp.oninput = () => { clearTimeout(timer); timer = setTimeout(() => buscar().catch(() => {}), 150); };
  inp.onblur = () => setTimeout(() => { if (!sel) lista.hidden = true; }, 200);
  lista.onmousedown = async (ev) => {
    ev.preventDefault();
    const b = ev.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.nueva) { const c = await api('POST', '/api/clientes', { nombre: inp.value.trim() }); sel = { id: c.id, nombre: c.nombre }; }
      else sel = { id: Number(b.dataset.id), nombre: b.dataset.n };
      pintar(); onCambio(sel);
    } catch (e) { toast(e.message, { error: true }); }
  };
  x.onclick = () => { sel = null; pintar(); onCambio(null); inp.focus(); };
  pintar();
  return { get valor() { return sel; } };
}