// Pantalla PERSONAL (versión funcional simple): empleados y cómo se les paga por categoría.
const Personal = (() => {
  const CATS = [['corte', 'Corte'], ['color', 'Color'], ['nutri', 'Nutri'], ['otro', 'Otro']];
  let el, lista = [], defCorte = null;

  async function montar(contenedor) {
    el = contenedor;
    lista = await api('GET', '/api/empleados');
    defCorte = (await api('GET', '/api/config')).empleado_corte;
    pintar();
    el.onclick = onClick;
  }

  function tarjeta(e) {
    return `<div class="tarjeta" data-id="${e.id}">
      <label class="cam" style="margin-top:0">Nombre</label><input type="text" data-f="nombre" value="${h(e.nombre)}">
      <label style="display:block;margin:10px 0;font-size:13px"><input type="checkbox" data-f="activo" ${e.activo ? 'checked' : ''}> Activo</label>
            <label style="display:block;margin:0 0 10px;font-size:13px"><input type="checkbox" data-f="corte-def" ${e.id === defCorte ? 'checked' : ''}> Cortes por defecto a esta persona</label>
      <label class="cam">Cómo se le paga</label>
      ${CATS.map(([c, nombre]) => `<div class="pago-fila"><span>${nombre}</span>
        <select data-f="modo-${c}"><option value="porcentaje" ${e.pagos[c].modo === 'porcentaje' ? 'selected' : ''}>Porcentaje (%)</option><option value="hora" ${e.pagos[c].modo === 'hora' ? 'selected' : ''}>Por hora ($)</option></select>
        <input type="number" min="0" step="any" data-f="valor-${c}" value="${e.pagos[c].valor}"></div>`).join('')}
      <p class="nota">Porcentaje: sobre el precio final cobrado. Por hora: horas reales × el valor de la hora.</p>
      <button class="btn-verde" data-acc="guardar-emp" style="width:auto">Guardar</button></div>`;
  }

  function pintar() {
    el.innerHTML = `<h1>Personal</h1>
      <div class="tarjetas">${lista.map(tarjeta).join('')}
        <div class="tarjeta"><label class="cam" style="margin-top:0">Agregar empleado</label><input type="text" id="emp-nuevo" placeholder="Nombre">
          <p class="nota">Arranca con 40% en corte, nutri y otro; y color por hora (cargá el valor de la hora).</p>
          <button class="btn-oro" data-acc="crear-emp">＋ Agregar</button></div></div>`;
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    try {
      if (b.dataset.acc === 'crear-emp') {
        const nombre = $('#emp-nuevo', el).value.trim(); if (!nombre) return toast('Falta el nombre', { error: true });
        await api('POST', '/api/empleados', { nombre }); await montar(el); toast('Empleado agregado');
      }
      if (b.dataset.acc === 'guardar-emp') {
        const t = b.closest('.tarjeta'), q = (f) => $(`[data-f="${f}"]`, t);
        const pagos = {};
        for (const [c] of CATS) pagos[c] = { modo: q('modo-' + c).value, valor: Number(q('valor-' + c).value) };
        await api('PUT', `/api/empleados/${t.dataset.id}`, { nombre: q('nombre').value, activo: q('activo').checked, pagos });
                const cd = q('corte-def');
        if (cd.checked) { await api('PUT', '/api/config/empleado-corte', { empleado_id: Number(t.dataset.id) }); defCorte = Number(t.dataset.id); el.querySelectorAll('[data-f="corte-def"]').forEach((x) => { if (x !== cd) x.checked = false; }); }
        else if (defCorte === Number(t.dataset.id)) { await api('PUT', '/api/config/empleado-corte', { empleado_id: null }); defCorte = null; }
        estadoGuardado(true); toast('Cambios guardados');
      }
    } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
  }
  return { montar };
})();