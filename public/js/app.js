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
    $('#nav').innerHTML = VISTAS.map(([k, t, i]) => `<button class="nav-item ${k === actual ? 'on' : ''}" data-vista="${k}">${i} &nbsp;${h(t)}</button>`).join('');
  }

  async function ir(vista) {
    actual = vista; pintarNav();
    const v = $('#vista'); v.onclick = v.onchange = v.oninput = null;
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

  async function mostrarLogin() {
    const { configurado } = await api('GET', '/api/auth/estado');
    const L = $('#login'); L.hidden = false;
    L.innerHTML = `<div class="caja"><div class="monograma">CH</div><h1>CHROMATICA</h1>
      <p>${configurado ? 'Ingresá para continuar' : 'Primera vez: creá tu usuario'}</p>
      <form id="f-login"><input type="text" id="l-usuario" placeholder="Usuario" autocomplete="username" required>
        <input type="password" id="l-pass" placeholder="Contraseña" autocomplete="current-password" required>
        ${configurado ? '' : '<input type="email" id="l-mail" placeholder="Mail de la peluquería (para recuperar el acceso)" required>'}
        <div id="l-msg" class="err" hidden></div><button class="btn-verde" type="submit">${configurado ? 'Ingresar' : 'Crear usuario'}</button></form>
      ${configurado ? '<p style="margin-top:14px"><button class="btn-lnk" id="l-olvide">Olvidé mi usuario o contraseña</button></p>' : ''}</div>`;
    const msg = (t, ok) => { const m = $('#l-msg'); m.hidden = !t; m.textContent = t || ''; m.style.cssText = ok ? 'background:#e4efe8;color:var(--verde);border-color:var(--ok)' : ''; };
    $('#f-login').onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const usuario = $('#l-usuario').value, password = $('#l-pass').value;
        if (!configurado) await api('POST', '/api/auth/setup', { usuario, password, mail: $('#l-mail').value });
        await api('POST', '/api/auth/login', { usuario, password });
        mostrarApp();
      } catch (e) { msg(e.message); }
    };
    $('#l-olvide')?.addEventListener('click', async () => {
      try { const r = await api('POST', '/api/auth/recuperar'); msg(`Te enviamos el usuario y una contraseña temporal a ${r.enviado_a}`, true); }
      catch (e) { msg(e.message); }
    });
  }

  async function iniciar() {
    $('#nav').onclick = (ev) => { const b = ev.target.closest('[data-vista]'); if (b) ir(b.dataset.vista); };
    document.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-acc="salir"]')) { await api('POST', '/api/auth/logout').catch(() => {}); sesionVencida(); }
    });
    try { await api('GET', '/api/auth/yo'); mostrarApp(); }
    catch (e) { if (e.status === 401) { /* ya mostró el login */ } else mostrarLogin(); }
  }

  return { iniciar, sesionVencida };
})();
App.iniciar();