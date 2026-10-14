// Pantalla GANANCIAS: resumen, historial, movimientos y cierre de caja (pestañas).
const Ganancias = (() => {
  const TABS = [['resumen', 'Resumen'], ['historial', 'Historial'], ['movimientos', 'Movimientos'], ['cierre', 'Cierre de caja']];
  const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  let el, tab = 'resumen';
  const H = { desde: '', hasta: '' };           // rango del historial
  const C = { hasta: '', nota: '' };            // cierre

  function semanaActual() {
    const d = new Date(), lun = new Date(d); lun.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
    return [lun.toLocaleDateString('en-CA'), dom.toLocaleDateString('en-CA')];
  }

  async function montar(contenedor, { abrir } = {}) {
    el = contenedor;
    if (!H.desde) [H.desde, H.hasta] = semanaActual();
    if (!C.hasta) C.hasta = hoyISO();
    if (abrir) tab = abrir;
    el.onclick = onClick; el.onchange = onChange;
    await pintar();
  }

  async function pintar() {
    el.innerHTML = `<h1>Ganancias</h1><div class="tabs">${TABS.map(([k, t]) => `<button class="tab ${k === tab ? 'on' : ''}" data-acc="tab" data-k="${k}">${t}</button>`).join('')}</div><div id="g-cuerpo"></div>`;
    const c = $('#g-cuerpo', el);
    try { c.innerHTML = await VISTA[tab](); } catch (e) { if (e.status !== 401) toast(e.message, { error: true }); }
  }

  // ---------- Resumen ----------
  async function resumen() {
    const r = await api('GET', '/api/ganancias/resumen');
    const tarjeta = (t, p) => `<div class="panel kpi"><div class="eyebrow">${t}</div><div class="grande">${peso(p.ganancia)}</div><small>ganancia de la pelu</small>
      <div class="tot"><div><span>Cobrado (${p.cobros})</span><span>${peso(p.total)}</span></div><div><span>Pagos al personal</span><span>− ${peso(p.pagos_empleados)}</span></div><div><span>Gastos</span><span>− ${peso(p.gastos)}</span></div></div></div>`;
    const max = Math.max(1, ...r.dias.map((d) => d.total));
    return `${r.horas_pendientes ? `<div class="aviso">Hay ${r.horas_pendientes} servicio(s) de color con horas pendientes. <button class="btn-lnk" data-acc="tab" data-k="historial">Completarlas en el historial</button></div>` : ''}
      <div class="kpis">${tarjeta('Esta semana', r.semana)}${tarjeta('Este mes', r.mes)}</div>
      <div class="kpis"><div class="panel"><div class="eyebrow">A pagar al personal</div>
        ${r.a_pagar.length ? `<table class="tabla"><tr><th>Empleado</th><th class="r">Pagos</th><th class="r">Adelantos</th><th class="r">A pagar</th></tr>${r.a_pagar.map((e) => `<tr><td>${h(e.empleado)}</td><td class="r">${peso(e.pagos)}</td><td class="r">− ${peso(e.adelantos)}</td><td class="r"><b>${peso(e.neto)}</b></td></tr>`).join('')}</table><p class="nota">Desde el último cierre de caja.</p>` : '<p class="nota">Todavía no hay empleados cargados.</p>'}</div>
        <div class="panel"><div class="eyebrow">Cobros por día · semana</div><div class="barras">${r.dias.map((d, i) => `<div class="barra"><span class="v">${d.total ? peso(d.total).replace('$ ', '') : ''}</span><i style="height:${Math.round(d.total / max * 100)}%"></i><span>${DIAS[i]}</span></div>`).join('')}</div></div></div>`;
  }

  // ---------- Historial ----------
  async function historial() {
    const l = await api('GET', `/api/cobros?desde=${H.desde}&hasta=${H.hasta}`);
    const validos = l.filter((c) => !c.anulado);
    return `<div class="filtro"><label>Desde <input type="date" data-campo="h-desde" value="${H.desde}"></label><label>Hasta <input type="date" data-campo="h-hasta" value="${H.hasta}"></label>
      <button class="btn-lnk" data-acc="esta-semana">Esta semana</button></div>
      ${l.length ? `<table class="tabla"><tr><th>Fecha</th><th>Clienta</th><th>Servicios</th><th class="r">Precio final</th><th></th></tr>
      ${l.map((c) => `<tr class="fila-cobro ${c.anulado ? 'anulado' : ''}" data-acc="ver" data-id="${c.id}"><td>${fdia(c.fecha)}</td><td>${h(c.clienta || '—')}</td>
        <td>${c.servicios.map((s) => h(s.recorrido.replaceAll(' › ', ' · '))).join('<br>')}</td><td class="r">${peso(c.total)}</td>
        <td>${c.anulado ? '<span class="tag mal">Anulado</span>' : ''}${c.horas_pendientes ? '<span class="tag aviso-t">Horas pendientes</span>' : ''}${c.cierre_id ? '<span class="tag">Cerrado</span>' : ''}</td></tr>`).join('')}
      <tr class="pie"><td colspan="3">Total (${validos.length} cobros)</td><td class="r"><b>${peso(validos.reduce((a, c) => a + c.total, 0))}</b></td><td></td></tr></table>` : '<p class="nota" style="margin-top:16px">No hay cobros en estas fechas.</p>'}`;
  }

  // ---------- Movimientos ----------
  async function movimientos() {
    const [l, emps] = await Promise.all([api('GET', '/api/movimientos'), api('GET', '/api/empleados')]);
    const NOM = { adelanto: 'Adelanto', gasto: 'Gasto', retiro: 'Retiro' };
    return `<div class="panel" style="margin-bottom:16px"><div class="eyebrow">Nuevo movimiento</div>
      <div class="form-mov"><select id="mv-tipo" data-campo="mv-tipo"><option value="gasto">Gasto</option><option value="adelanto">Adelanto a empleado</option><option value="retiro">Retiro de la dueña</option></select>
        <select id="mv-emp" hidden>${emps.filter((e) => e.activo).map((e) => `<option value="${e.id}">${h(e.nombre)}</option>`).join('')}</select>
        <input type="number" min="0" id="mv-monto" placeholder="Monto"><input type="text" id="mv-concepto" placeholder="Concepto (opcional)"><button class="btn-oro" data-acc="mv-agregar">Agregar</button></div>
      <p class="nota">Los gastos restan ganancia; los adelantos se descuentan al empleado; los retiros no restan ganancia.</p></div>
      ${l.length ? `<table class="tabla"><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th class="r">Monto</th><th></th></tr>${l.map((m) => `<tr><td>${fdia(m.fecha)}</td><td>${NOM[m.tipo]}${m.empleado ? ' · ' + h(m.empleado) : ''}</td><td>${h(m.concepto || '')}</td><td class="r">${peso(m.monto)}</td><td><button class="btn-lnk" data-acc="mv-anular" data-id="${m.id}">Anular</button></td></tr>`).join('')}</table>
      <p class="nota">Solo se muestran los movimientos sin cerrar.</p>` : '<p class="nota">No hay movimientos sin cerrar.</p>'}`;
  }

  // ---------- Cierre de caja ----------
  async function cierre() {
    const [p, lista] = await Promise.all([api('GET', `/api/cierres/previa?hasta=${C.hasta}`), api('GET', '/api/cierres')]);
    const vivos = lista.filter((c) => !c.anulado);
    const vacio = !p.cantidad_cobros && !p.movimientos, bloqueado = p.pendientes.length > 0;
    return `<div class="panel"><div class="cab"><div><div class="eyebrow">Vista previa</div><h2>Cerrar hasta el</h2></div>
        <input type="date" data-campo="c-hasta" value="${C.hasta}" max="${hoyISO()}" style="width:auto"></div>
      ${bloqueado ? `<div class="err">Faltan las horas de ${p.pendientes.length} servicio(s) de color. <button class="btn-lnk" data-acc="tab" data-k="historial">Completarlas en el historial</button></div>` : ''}
      <div class="tot" style="margin-top:14px"><div><span>Cobros incluidos</span><span>${p.cantidad_cobros}</span></div><div><span>Total cobrado</span><span>${peso(p.total_cobrado)}</span></div>
        <div><span>Pagos al personal</span><span>− ${peso(p.pagos_empleados)}</span></div><div><span>Gastos</span><span>− ${peso(p.gastos)}</span></div><div><span>Retiros (no restan ganancia)</span><span>${peso(p.retiros)}</span></div></div>
      <div class="saldo"><span>Ganancia de la pelu</span><b>${peso(p.ganancia_local)}</b></div>
      ${p.por_empleado.length ? `<table class="tabla"><tr><th>Empleado</th><th class="r">Pagos</th><th class="r">Adelantos</th><th class="r">Neto a pagar</th></tr>${p.por_empleado.map((e) => `<tr><td>${h(e.empleado)}</td><td class="r">${peso(e.pago_total)}</td><td class="r">− ${peso(e.adelantos)}</td><td class="r"><b>${peso(e.neto)}</b></td></tr>`).join('')}</table>` : ''}
      <label class="cam">Nota (opcional)</label><input type="text" data-campo="c-nota" value="${h(C.nota)}">
      <div style="margin-top:14px"><button class="btn-verde" data-acc="cerrar-caja" ${vacio || bloqueado ? 'disabled' : ''}>Cerrar caja</button></div></div>
      ${vivos.length ? `<h3 style="margin:22px 0 8px">Cierres anteriores</h3><table class="tabla"><tr><th>Período</th><th class="r">Cobrado</th><th class="r">Ganancia</th><th></th></tr>${vivos.map((c, i) => `<tr><td>${h((c.desde || '').slice(0, 10))} → ${h(c.hasta.slice(0, 10))}</td><td class="r">${peso(c.total_cobrado)}</td><td class="r">${peso(c.ganancia_local)}</td><td>${i === 0 ? `<button class="btn-lnk" data-acc="anular-cierre" data-id="${c.id}">Anular último cierre</button>` : ''}</td></tr>`).join('')}</table>` : ''}`;
  }

  const VISTA = { resumen, historial, movimientos, cierre };

  // ---------- eventos ----------
  const ACC = {
    tab: (d) => { tab = d.k; return pintar(); },
    'esta-semana': () => { [H.desde, H.hasta] = semanaActual(); return pintar(); },
    ver: (d) => Detalle.abrir(Number(d.id), () => { if (tab === 'historial') pintar(); }),
    'mv-agregar': async () => {
      const tipo = $('#mv-tipo', el).value, monto = Number($('#mv-monto', el).value);
      if (!(monto > 0)) return toast('Cargá un monto', { error: true });
      await api('POST', '/api/movimientos', { tipo, monto, concepto: $('#mv-concepto', el).value, empleado_id: tipo === 'adelanto' ? Number($('#mv-emp', el).value) : null });
      estadoGuardado(true); toast('Movimiento agregado'); return pintar();
    },
    'mv-anular': (d, b) => doble(b, '¿Seguro?', async () => { await api('POST', `/api/movimientos/${d.id}/anular`, {}); toast('Movimiento anulado'); await pintar(); }),
    'cerrar-caja': (_d, b) => doble(b, `Confirmar cierre hasta el ${fdia(C.hasta)}`, async () => {
      await api('POST', '/api/cierres', { hasta: C.hasta, nota: C.nota || null }); C.nota = ''; estadoGuardado(true); toast('Caja cerrada'); await pintar();
    }),
    'anular-cierre': (d, b) => doble(b, '¿Seguro? Los cobros vuelven a quedar abiertos', async () => { await api('POST', `/api/cierres/${d.id}/anular`, {}); toast('Cierre anulado'); await pintar(); }),
  };

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]');
    if (!b || !ACC[b.dataset.acc]) return;
    try { await ACC[b.dataset.acc](b.dataset, b); } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
  }
  function onChange(ev) {
    const t = ev.target, c = t.dataset.campo;
    if (c === 'h-desde') { H.desde = t.value; pintar(); }
    else if (c === 'h-hasta') { H.hasta = t.value; pintar(); }
    else if (c === 'c-hasta') { C.hasta = t.value || hoyISO(); pintar(); }
    else if (c === 'c-nota') C.nota = t.value;
    else if (c === 'mv-tipo') $('#mv-emp', el).hidden = t.value !== 'adelanto';
  }

  return { montar };
})();