// Detalle de un cobro (comprobante): consulta, completar horas / profesional, ficha, clienta y anular.
const Detalle = (() => {
  async function abrir(id, onCambio) {
    const m = $('#modal');
    const [d, emps, clientas] = await Promise.all([api('GET', `/api/cobros/${id}`), api('GET', '/api/empleados'), api('GET', '/api/clientes?q=')]);
    pintar(m, d, emps.filter((e) => e.activo), clientas, onCambio);
    m.hidden = false;
  }

  function pintar(m, d, emps, clientas, onCambio) {
    const edit = !d.anulado && !d.cierre_id;
    const estado = d.anulado ? '<span class="tag mal">Anulado</span>' : d.cierre_id ? '<span class="tag">En un cierre de caja</span>' : '';
    const metodo = d.metodo_cobro === 'tarjeta' ? `${d.cuotas} ${d.cuotas === 1 ? 'cuota' : 'cuotas'}` : 'Efectivo / transferencia';
    const filas = d.servicios.map((s) => `<tr data-sid="${s.id}"><td>${h(s.recorrido)}${s.editado ? ' <small>(editado)</small>' : ''}</td>
      <td class="r">${peso(s.precio_lista)}</td><td class="r">${peso(s.precio_cobrado)}</td>
      <td>${edit ? `<select data-f="emp"><option value="">Sin asignar</option>${emps.map((e) => `<option value="${e.id}" ${e.id === s.empleado_id ? 'selected' : ''}>${h(e.nombre)}</option>`).join('')}</select>` : h(s.empleado || '—')}</td>
      <td>${s.pago_modo === 'hora' ? (edit ? `<input type="number" step="0.25" min="0" data-f="horas" value="${s.horas ?? ''}" placeholder="Horas">` : (s.horas ?? 'Pendiente')) : '—'}</td>
      <td class="r">${s.empleado_id ? (s.pago_modo === 'hora' && s.horas == null ? 'Pendiente' : peso(s.pago_monto)) : '—'}</td></tr>`).join('');
    m.innerHTML = `<div><h2 style="font-size:28px">Cobro #${d.id} ${estado}</h2>
      <p class="nota">${h(d.fecha.slice(0, 16))} · ${metodo}</p>
      <table class="tabla"><tr><th>Servicio</th><th class="r">Lista</th><th class="r">Final</th><th>Profesional</th><th>Horas</th><th class="r">Pago</th></tr>${filas}</table>
      <div class="tot"><div><span>Total del cobro</span><span>${peso(d.total)}</span></div><div><span>Seña</span><span>− ${peso(d.sena)}</span></div><div><b>Saldo cobrado</b><b>${peso(d.saldo)}</b></div></div>
      ${edit ? `<label class="cam">Clienta</label><select id="dt-cli"><option value="">Sin clienta</option>${clientas.map((c) => `<option value="${c.id}" ${c.id === d.cliente_id ? 'selected' : ''}>${h(c.nombre)}</option>`).join('')}</select>
        <label class="cam">Ficha de este turno</label><textarea id="dt-ficha" rows="3">${h(d.ficha || '')}</textarea>
        <label class="cam">Notas</label><textarea id="dt-notas" rows="2">${h(d.notas || '')}</textarea>
        <label class="cam">Fecha del cobro</label><input type="date" id="dt-fecha" value="${d.fecha.slice(0, 10)}">
        <div style="margin-top:12px"><button class="btn-oro" id="dt-guardar">Guardar datos</button></div>`
        : `${d.cliente ? `<p><b>Clienta:</b> ${h(d.cliente.nombre)}</p>` : ''}${d.ficha ? `<p><b>Ficha:</b> ${h(d.ficha)}</p>` : ''}${d.notas ? `<p><b>Notas:</b> ${h(d.notas)}</p>` : ''}`}
      <div style="margin-top:18px;display:flex;gap:10px;justify-content:space-between">
        <button class="btn-oro" id="dt-cerrar">Cerrar</button>
        ${edit ? '<button class="btn-lnk" id="dt-anular">Anular cobro</button>' : ''}</div></div>`;

    const refrescar = async (msg) => { onCambio?.(); const r = await api('GET', `/api/cobros/${d.id}`); pintar(m, r, emps, clientas, onCambio); if (msg) toast(msg); };
    const guardar = async (fn) => { try { await fn(); estadoGuardado(true); } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); } };
    $('#dt-cerrar', m).onclick = () => { m.hidden = true; };
    m.querySelectorAll('tr[data-sid]').forEach((tr) => {
      tr.querySelectorAll('[data-f]').forEach((inp) => {
        inp.onchange = () => guardar(async () => {
          const body = {};
          if (inp.dataset.f === 'emp') body.empleado_id = inp.value === '' ? null : Number(inp.value);
          else body.horas = inp.value === '' ? null : Number(inp.value);
          await api('PUT', `/api/cobros/${d.id}/servicios/${tr.dataset.sid}`, body);
          await refrescar('Guardado');
        });
      });
    });
    if (edit) {
      $('#dt-guardar', m).onclick = () => guardar(async () => {
        const body = { cliente_id: $('#dt-cli', m).value === '' ? null : Number($('#dt-cli', m).value), ficha: $('#dt-ficha', m).value.trim(), notas: $('#dt-notas', m).value.trim() };
        if ($('#dt-fecha', m).value && $('#dt-fecha', m).value !== d.fecha.slice(0, 10)) body.fecha = `${$('#dt-fecha', m).value} 12:00`;
        await api('PATCH', `/api/cobros/${d.id}`, body);
        await refrescar('Datos guardados');
      });
      $('#dt-anular', m).onclick = (ev) => doble(ev.target, '¿Seguro? Tocá de nuevo para anular', () => guardar(async () => {
        await api('POST', `/api/cobros/${d.id}/anular`, {});
        onCambio?.(); m.hidden = true; toast('Cobro anulado');
      }));
    }
  }
  return { abrir };
})();