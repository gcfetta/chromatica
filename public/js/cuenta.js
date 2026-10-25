// Sección "Acceso al sistema" (en Personal): cambiar contraseña, editar usuario y mail, eliminar la cuenta.
const Cuenta = (() => {
  async function montar(cont) {
    const yo = await api('GET', '/api/auth/yo');
    cont.innerHTML = `<div class="cuenta-grid">
      <div class="panel"><div class="eyebrow">Contraseña</div>
        <div class="cuenta-form">
          <input type="password" id="cu-1" placeholder="Contraseña actual" autocomplete="current-password">
          <input type="password" id="cu-2" placeholder="Contraseña nueva (6+ caracteres)" autocomplete="new-password">
          <input type="password" id="cu-3" placeholder="Repetí la contraseña nueva" autocomplete="new-password">
          <button class="btn-verde" data-cuenta="clave">Cambiar contraseña</button></div></div>
      <div class="panel"><div class="eyebrow">Datos de la cuenta</div>
        <div class="cuenta-form">
          <input type="text" id="cu-user" value="${h(yo.usuario)}" placeholder="Usuario" autocomplete="off">
          <input type="email" id="cu-mail" value="${h(yo.mail_recuperacion || '')}" placeholder="Mail" autocomplete="off">
          <input type="password" id="cu-pw" placeholder="Contraseña actual (para confirmar)" autocomplete="current-password">
          <button class="btn-verde" data-cuenta="datos">Guardar datos</button>
          <div class="cuenta-acc"><button class="btn-lnk mal" data-cuenta="eliminar">Eliminar cuenta</button></div>
          <p class="nota" style="margin:0">Eliminar la cuenta no borra los datos del sistema: al volver a abrirlo se crea una cuenta nueva.</p></div></div></div>`;
    const v = (id) => $('#' + id, cont).value;
    cont.onclick = async (ev) => {
      const b = ev.target.closest('[data-cuenta]'); if (!b) return;
      const a = b.dataset.cuenta;
      try {
        if (a === 'clave') {
          if (v('cu-2') !== v('cu-3')) return toast('Las contraseñas nuevas no coinciden', { error: true });
          await Acceso.post('/api/auth/cambiar-password', { actual: v('cu-1'), nueva: v('cu-2') });
          ['cu-1', 'cu-2', 'cu-3'].forEach((i) => { $('#' + i, cont).value = ''; }); toast('Contraseña cambiada');
        } else if (a === 'datos') {
          await Acceso.post('/api/auth/cuenta/editar', { usuario: v('cu-user'), mail: v('cu-mail'), password: v('cu-pw') });
          $('#cu-pw', cont).value = ''; toast('Datos guardados');
        } else if (a === 'eliminar') {
          doble(b, '¿Seguro? Tocá de nuevo para eliminar', async () => {
            try { await Acceso.post('/api/auth/cuenta/eliminar', { password: v('cu-pw') }); location.reload(); }
            catch (e) { toast(e.message, { error: true }); }
          });
        }
      } catch (e) { toast(e.message, { error: true }); }
    };
  }
  return { montar };
})();