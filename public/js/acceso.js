// Acceso: primera vez (mail + usuario + contraseña), ingreso (usuario + contraseña) y "olvidé mi contraseña" (mail + contraseña nueva).
const Acceso = (() => {
  // fetch propio: un 401 acá (contraseña mal) no debe tratarse como "sesión vencida"
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || 'Error inesperado');
    return d;
  }

  async function mostrar({ alEntrar }) {
    const L = $('#login'); L.hidden = false;
    const configurado = (await api('GET', '/api/auth/estado')).configurado;
    pintar(configurado ? 'login' : 'setup');

    function pintar(p, o = {}) {
      const campo = (id, tipo, ph, ac = '') => `<input type="${tipo}" id="${id}" placeholder="${ph}" autocomplete="${ac || 'off'}" required>`;
      const V = {
        setup: ['Primera vez: creá tu cuenta',
          campo('a-mail', 'email', 'Mail', 'email') + campo('a-user', 'text', 'Usuario', 'username') + campo('a-pass', 'password', 'Contraseña (6+ caracteres)', 'new-password'), 'Crear cuenta e ingresar'],
        login: ['Ingresá para continuar',
          campo('a-user', 'text', 'Usuario', 'username') + campo('a-pass', 'password', 'Contraseña', 'current-password'), 'Ingresar'],
        olvide: ['Escribí el mail con el que creaste la cuenta', campo('a-mail', 'email', 'Mail', 'email'), 'Continuar'],
        nueva: ['Elegí tu contraseña nueva',
          campo('a-nueva', 'password', 'Contraseña nueva (6+ caracteres)', 'new-password') + campo('a-rep', 'password', 'Repetí la contraseña', 'new-password'), 'Guardar y entrar'],
      }[p];
      L.innerHTML = `<div class="caja"><div class="monograma">CH</div><h1>CHROMATICA</h1><p>${h(V[0])}</p>
        <form id="a-form">${V[1]}<div id="a-msg" class="err" hidden></div><button class="btn-verde" type="submit">${V[2]}</button></form>
        ${p === 'login' ? '<p style="margin-top:14px"><button class="btn-lnk" id="a-olvide" type="button">Olvidé mi contraseña</button></p>' : ''}
        ${p === 'olvide' ? '<p style="margin-top:14px"><button class="btn-lnk" id="a-volver" type="button">Volver</button></p>' : ''}</div>`;
      $('#a-form input')?.focus();
      const msg = (t) => { const m = $('#a-msg'); m.hidden = !t; m.textContent = t || ''; };

      $('#a-form').onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          if (p === 'setup') { await post('/api/auth/setup', { mail: $('#a-mail').value, usuario: $('#a-user').value, password: $('#a-pass').value }); alEntrar(); }
          else if (p === 'login') { await post('/api/auth/login', { usuario: $('#a-user').value, password: $('#a-pass').value }); alEntrar(); }
          else if (p === 'olvide') { const r = await post('/api/auth/olvide', { mail: $('#a-mail').value }); pintar('nueva', { token: r.token }); }
          else {
            if ($('#a-nueva').value !== $('#a-rep').value) return msg('Las contraseñas no coinciden');
            await post('/api/auth/restablecer', { token: o.token, nueva: $('#a-nueva').value }); alEntrar();
          }
        } catch (e) { msg(e.message); }
      };
      $('#a-olvide')?.addEventListener('click', () => pintar('olvide'));
      $('#a-volver')?.addEventListener('click', () => pintar('login'));
    }
  }
  return { mostrar, post };
})();