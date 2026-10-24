// Panel "Acceso al sistema" (dentro de Personal): cambiar la contraseña.
const Cuenta = (() => {
  async function montar(cont) {
    const yo = await api('GET', '/api/auth/yo');
    cont.innerHTML = `<div class="panel"><div class="eyebrow">Acceso al sistema</div>
      <p class="nota" style="margin-top:8px">Usuario: ${h(yo.usuario)} · Mail: ${h(yo.mail_recuperacion || '—')}</p>
      <div class="cuenta-form">
        <input type="password" id="cu-1" placeholder="Contraseña actual" autocomplete="current-password">
        <input type="password" id="cu-2" placeholder="Contraseña nueva (6+ caracteres)" autocomplete="new-password">
        <input type="password" id="cu-3" placeholder="Repetí la contraseña nueva" autocomplete="new-password">
        <button class="btn-verde" data-cuenta="guardar">Cambiar contraseña</button></div></div>`;
    cont.onclick = async (ev) => {
      if (!ev.target.closest('[data-cuenta="guardar"]')) return;
      const v = (i) => $('#cu-' + i, cont).value;
      if (v(2) !== v(3)) return toast('Las contraseñas nuevas no coinciden', { error: true });
      try {
        await Acceso.post('/api/auth/cambiar-password', { actual: v(1), nueva: v(2) });
        ['1', '2', '3'].forEach((i) => { $('#cu-' + i, cont).value = ''; }); toast('Contraseña cambiada');
      } catch (e) { toast(e.message, { error: true }); }
    };
  }
  return { montar };
})();