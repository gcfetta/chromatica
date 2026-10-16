// Detalle de un cobro (comprobante): todo dentro del modal, sin scroll de página.
// Tocar afuera cierra sin guardar; "Guardar datos" guarda clienta, ficha, notas y fecha.
const Detalle = (() => {
  async function abrir(id, onCambio) {
    const m = $('#modal');
    const [d, emps] = await Promise.all([api('GET', `/api/cobros/${id}`), api('GET', '/api/empleados')]);
    pintar(m, d, emps.filter((e) => e.activo), onCambio);
    m.hidden = false;
  }

  function pintar(m, d, emps, onCambio, borrador) {
    const edit = !d.anulado && !d.cierre_id;
    const b = borrador || { cliente: d.cliente ? { id: d.cliente.id, nombre: d.cliente.nombre } : null, ficha: d.ficha || '', notas: d.notas || '', fecha: d.fecha.slice(0, 10) };
    const estado = d.anulado ? '<span class="tag mal">Anulado</span>' : d.cierre_id ? '<span class="tag">En un cierre de caja</span>' : '';
    const metodo = d.metodo_cobro === 'tarjeta' ? `${d.cuotas} ${d.cuotas === 1 ? 'cuota' : 'cuotas'}` : 'Efectivo / transferencia';
    const filas = d.servicios.map((s) => `<tr data-sid="${s.id}"><td>${h(s.recorrido.replaceAll(' › ', ' · '))}${s.editado ? ' <small>(editado)</small>' : ''}</td>
      <td class="r">${peso(s.precio_lista)}</td><td class="r">${peso(s.precio_cobrado)}</td>
      <td>${edit ? `<select data-f="emp"><option value="">Sin asignar</option>${emps.map((e) => `<option value="${e.id}" ${e.id === s.empleado_id ? 'selected' : ''}>${h(e.nombre)}</option>`).join('')}</select>` : h(s.empleado || '—')}</td>
      <td>${s.pago_modo === 'hora' ? (edit ? `<input type="number" step="0.25" min="0" data-f="horas" value="${s.horas ?? ''}" placeholder="Horas" style="width:80px">` : (s.horas ?? 'Pendiente')) : '—'}</td>
      <td class="r">${s.empleado_id ? (s.pago_modo === 'hora' && s.horas == null ? 'Pendiente' : peso(s.pago_monto)) : '—'}</td></tr>`).join('');
    m.innerHTML = `<div class="ancho"><div class="mod-cab"><h2>Cobro #${d.id} ${estado}</h2><p class="nota">${h(d.fecha.slice(0, 16))} · ${metodo}</p></div>
      <div class="mod-tabla"><table class="tabla"><tr><th>Servicio</th><th class="r">Lista</th><th class="r">Final</th><th>Profesional</th><th>Horas</th><th class="r">Pago</th></tr>${filas}</table></div>
      <div class="tot"><div><span>Total del cobro</span><span>${peso(d.total)}</span></div><div><span>Seña</span><span>− ${peso(d.sena)}</span></div><div><b>Saldo cobrado</b><b>${peso(d.saldo)}</b></div></div>
      ${edit ? `<div class="mod-grid"><div><label class="cam">Clienta</label><div id="dt-combo"></div><label class="cam">Fecha del cobro</label><input type="date" id="dt-fecha" value="${h(b.fecha)}"></div>
        <div><label class="cam">Ficha de este turno</label><textarea id="dt-ficha" rows="2">${h(b.ficha)}</textarea><label class="cam">Notas</label><textarea id="dt-notas" rows="2">${h(b.notas)}</textarea></div></div>`
        : `<div class="mod-info">${d.cliente ? `<p><b>Clienta:</b> ${h(d.cliente.nombre)}</p>` : ''}${d.ficha ? `<p><b>Ficha:</b> ${h(d.ficha)}</p>` : ''}${d.notas ? `<p><b>Notas:</b> ${h(d.notas)}</p>` : ''}</div>`}
      <div class="mod-acc">${edit ? '<button class="btn-verde" id="dt-guardar">Guardar datos</button>' : ''}<button class="btn-oro" id="dt-cerrar">Cerrar</button><span class="sp"></span>
        ${edit ? '<button class="btn-lnk" id="dt-anular">Anular cobro</button>' : ''}${d.anulado && !d.cierre_id ? '<button class="btn-lnk" id="dt-eliminar" style="color:#a33">Eliminar cobro</button>' : ''}</div></div>`;

    const combo = edit ? selectorClienta($('#dt-combo', m), { valor: b.cliente }) : null;
    const leer = () => ({ cliente: combo.valor, ficha: $('#dt-ficha', m).value, notas: $('#dt-notas', m).value, fecha: $('#dt-fecha', m).value });
    const refrescar = async () => { onCambio?.(); const r = await api('GET', `/api/cobros/${d.id}`); pintar(m, r, emps, onCambio, edit ? leer() : undefined); };
    const guardar = async (fn) => { try { await fn(); estadoGuardado(true); } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); } };
    $('#dt-cerrar', m).onclick = () => cerrarCapa(m);
    m.querySelectorAll('tr[data-sid]').forEach((tr) => {
      tr.querySelectorAll('[data-f]').forEach((inp) => {
        inp.onchange = () => guardar(async () => {
          const body = {};
          if (inp.dataset.f === 'emp') body.empleado_id = inp.value === '' ? null : Number(inp.value);
          else body.horas = inp.value === '' ? null : Number(inp.value);
          await api('PUT', `/api/cobros/${d.id}/servicios/${tr.dataset.sid}`, body);
          await refrescar();
        });
      });
    });
    if (edit) {
      $('#dt-guardar', m).onclick = () => guardar(async () => {
        const v = leer();
        const body = { cliente_id: v.cliente ? v.cliente.id : null, ficha: v.ficha.trim(), notas: v.notas.trim() };
        if (v.fecha && v.fecha !== d.fecha.slice(0, 10)) body.fecha = `${v.fecha} 12:00`;
        await api('PATCH', `/api/cobros/${d.id}`, body);
        onCambio?.(); cerrarCapa(m); toast('Datos guardados');
      });
      $('#dt-anular', m).onclick = (ev) => doble(ev.target, '¿Seguro? Tocá de nuevo para anular', () => guardar(async () => {
        await api('POST', `/api/cobros/${d.id}/anular`, {});
        onCambio?.(); cerrarCapa(m); toast('Cobro anulado');
      }));
    }
        if (d.anulado && !d.cierre_id) $('#dt-eliminar', m).onclick = (ev) => doble(ev.target, '¿Seguro? Se elimina para siempre', () => guardar(async () => {
      await api('DELETE', `/api/cobros/${d.id}`);
      onCambio?.(); cerrarCapa(m); toast('Cobro eliminado');
    }));
  }
  return { abrir };
})();