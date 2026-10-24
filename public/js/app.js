// Arranque: sesión, menú y pantallas
const App = (() => {
  const VISTAS = [
    ['cobrar', 'Cobrar', '▣'], ['clientas', 'Clientas', '◔'],
    ['servicios', 'Servicios y precios', '✦'], ['ganancias', 'Ganancias', '▥'], ['personal', 'Personal', '♙'], ['copias', 'Copias de seguridad', '⛨'],
  ];
  let actual = 'cobrar';

  function fechaHoy() {
    const f = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#fecha').textContent = f;
  }

  function pintarNav() {
    $('#nav').innerHTML = VISTAS.map(([k, t, i]) => `<button class="nav-item${k === 'clientas' ? ' sub' : ''}${k === actual ? ' on' : ''}" data-vista="${k}">${h(t)}</button>`).join('');
  }

  async function ir(vista) {
    actual = vista; pintarNav();
    const v = $('#vista'); v.onclick = v.onchange = v.oninput = null; v.className = 'vista';
    try {
      if (vista === 'cobrar') await Cobrar.montar(v);
      else if (vista === 'servicios') await Servicios.montar(v);
      else if (vista === 'copias') await Copias.montar(v);
      else if (vista === 'clientas') await Clientas.montar(v);
      else if (vista === 'ganancias') await Ganancias.montar(v);
      else if (vista === 'personal') await Personal.montar(v);
      else v.innerHTML = `<h1>${h(VISTAS.find((x) => x[0] === vista)[1])}</h1><div class="panel" style="max-width:560px"><p class="nota" style="font-size:14px">Esta pantalla se arma en uno de los próximos pasos. Mientras tanto, la API ya está lista.</p></div>`;
    } catch (e) { if (e.status !== 401) toast(e.message, { error: true }); }
  }

  function mostrarApp() {
    $('#login').hidden = true; $('#app').hidden = false; fechaHoy(); ir(actual);
  }

  function sesionVencida() { $('#app').hidden = true; mostrarLogin(); }

function mostrarLogin(paso) { Acceso.mostrar({ paso, alEntrar: mostrarApp }); }

  async function iniciar() {
    ['modal', 'drawer'].forEach((id) => $('#' + id).addEventListener('mousedown', (ev) => { if (ev.target.id === id) cerrarCapa($('#' + id)); }));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') ['modal', 'drawer'].forEach((id) => { const e = $('#' + id); if (!e.hidden) cerrarCapa(e); }); });
    
    $('#nav').onclick = (ev) => { const b = ev.target.closest('[data-vista]'); if (b) ir(b.dataset.vista); };
    document.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-acc="salir"]')) { await api('POST', '/api/auth/logout').catch(() => {}); sesionVencida(); }
    });
    try { const yo = await api('GET', '/api/auth/yo'); if (yo.debe_cambiar) mostrarLogin('nueva'); else mostrarApp(); }
    catch (e) { if (e.status === 401) { /* ya mostró el login */ } else mostrarLogin(); }
  }

  return { iniciar, sesionVencida };
})();
App.iniciar();