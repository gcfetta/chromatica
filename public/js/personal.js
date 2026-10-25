// Pantalla PERSONAL: alta rápida arriba, empleados activos, y al final los desactivados (se pueden ocultar).
const Personal = (() => {
  const CATS = [['corte', 'Corte'], ['color', 'Color'], ['nutri', 'Nutri'], ['otro', 'Otro']];
  let el, lista = [], defCorte = null, verOff = false;

  async function montar(contenedor) {
    el = contenedor;
    lista = await api('GET', '/api/empleados');
    defCorte = (await api('GET', '/api/config')).empleado_corte;
    pintar();
    el.onclick = onClick;
  }

  function tarjeta(e, n) {
    return `<div class="tarjeta${e.activo ? '' : ' inactiva'}" data-id="${e.id}">
      <div class="emp-cab"><span class="av">${h((e.nombre || '?').trim().charAt(0).toUpperCase())}</span><div><small>FICHA #${String(n).padStart(2, '0')}</small><b class="${e.activo ? '' : 'off'}">${e.activo ? 'Activa' : 'Desactivada'}</b></div></div>
      <label class="cam" style="margin-top:0">Nombre</label><input type="text" data-f="nombre" value="${h(e.nombre)}">
      <label style="display:block;margin:10px 0;font-size:13px"><input type="checkbox" data-f="activo" ${e.activo ? 'checked' : ''}> Activo</label>
      <label style="display:block;margin:0 0 10px;font-size:13px"><input type="checkbox" data-f="corte-def" ${e.id === defCorte ? 'checked' : ''}> Cortes por defecto a esta persona</label>
      <label class="cam">Cómo se le paga</label>
      ${CATS.map(([c, nombre]) => `<div class="pago-fila"><span>${nombre}</span>
        <select data-f="modo-${c}"><option value="porcentaje" ${e.pagos[c].modo === 'porcentaje' ? 'selected' : ''}>Porcentaje (%)</option><option value="hora" ${e.pagos[c].modo === 'hora' ? 'selected' : ''}>Por hora ($)</option></select>
        <input type="number" min="0" step="any" data-f="valor-${c}" value="${e.pagos[c].valor}"></div>`).join('')}
      <p class="nota">Porcentaje: sobre el precio final cobrado. Por hora: horas reales × el valor de la hora.</p>
      <button class="btn-verde" data-acc="guardar-emp">Guardar</button>
      ${e.con_historial
        ? '<button class="btn-lnk emp-del" disabled title="Tiene turnos o movimientos asociados: solo se puede desactivar">Eliminar</button>'
        : '<button class="btn-lnk emp-del" data-acc="eliminar-emp">Eliminar</button>'}</div>`;
  }

  function pintar() {
    const num = new Map(lista.map((e, i) => [e.id, i + 1]));
    const act = lista.filter((e) => e.activo), off = lista.filter((e) => !e.activo);
    el.innerHTML = `<h1>Personal</h1>
      <div class="tarjetas">${act.map((e) => tarjeta(e, num.get(e.id))).join('')}
        <div class="tarjeta nueva"><label class="cam" style="margin-top:0">Agregar empleado</label><input type="text" id="emp-nuevo" placeholder="Nombre">
          <p class="nota">Arranca con 40% en corte, nutri y otro; y color por hora (cargá el valor de la hora).</p>
          <button class="btn-oro" data-acc="crear-emp">Agregar</button></div></div>
      ${off.length ? `<div class="off-cab"><h3>Desactivados <small>${off.length}</small></h3><button class="btn-lnk" data-acc="ver-off">${verOff ? 'Ocultar' : 'Mostrar'}</button></div>
        ${verOff ? `<div class="tarjetas">${off.map((e) => tarjeta(e, num.get(e.id))).join('')}<i hidden></i></div>` : ''}` : ''}
      <section class="sec-cuenta"><div class="sec-sep"><span>Acceso al sistema</span></div><div id="cuenta"></div></section>`;
    Cuenta.montar($('#cuenta', el));
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b || b.disabled) return;
    try {
      const a = b.dataset.acc;
      if (a === 'ver-off') { verOff = !verOff; pintar(); }
      else if (a === 'crear-emp') {
        const nombre = $('#emp-nuevo', el).value.trim(); if (!nombre) return toast('Falta el nombre', { error: true });
        await api('POST', '/api/empleados', { nombre }); await montar(el); toast('Empleado agregado');
      } else if (a === 'eliminar-emp') {
        const id = b.closest('.tarjeta').dataset.id;
        doble(b, '¿Seguro? Tocá de nuevo para eliminar', async () => {
          try { await api('DELETE', `/api/empleados/${id}`); estadoGuardado(true); toast('Empleado eliminado'); await montar(el); }
          catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
        });
      } else if (a === 'guardar-emp') {
        const t = b.closest('.tarjeta'), q = (f) => $(`[data-f="${f}"]`, t), id = Number(t.dataset.id);
        const pagos = {};
        for (const [c] of CATS) pagos[c] = { modo: q('modo-' + c).value, valor: Number(q('valor-' + c).value) };
        await api('PUT', `/api/empleados/${id}`, { nombre: q('nombre').value, activo: q('activo').checked, pagos });
        const cd = q('corte-def');
        if (cd.checked) { await api('PUT', '/api/config/empleado-corte', { empleado_id: id }); defCorte = id; }
        else if (defCorte === id) { await api('PUT', '/api/config/empleado-corte', { empleado_id: null }); defCorte = null; }
        lista = await api('GET', '/api/empleados'); pintar();      // si cambió el estado, la tarjeta se mueve sola
        estadoGuardado(true); toast('Cambios guardados');
      }
    } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
  }
  return { montar };
})();