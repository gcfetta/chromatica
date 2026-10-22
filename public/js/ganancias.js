// Pantalla GANANCIAS: resumen por período, historial, movimientos, pagos al personal y cierre de caja.
const Ganancias = (() => {
  const TABS = [['resumen', 'Resumen'], ['historial', 'Historial'], ['movimientos', 'Movimientos'], ['pagos', 'Pagos al personal'], ['cierre', 'Cierre de caja']];
  const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  let el, tab = 'resumen';
  const R = { tipo: 'semana', offset: 0 };      // período del resumen
  const H = { desde: '', hasta: '', modo: 'semana' };   // rango del historial (modo: semana | mes | rango)        // rango del historial
  const P = { mes: null, emp: '' };             // pagos al personal
  const C = { hasta: '', nota: '', i: 0 };      // cierre de caja (i = mes visible de los cierres anteriores)
  const nombreMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const conAv = (n) => `<span class="emp"><span class="av sm">${h(String(n || '?').trim().charAt(0).toUpperCase())}</span>${h(n)}</span>`;
  const chev = (acc, extra, simbolo, off) => `<button class="chev" data-acc="${acc}" ${extra} ${off ? 'disabled' : ''}>${simbolo}</button>`;

  function semanaActual() {
    const d = new Date(), lun = new Date(d); lun.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
    return [lun.toLocaleDateString('en-CA'), dom.toLocaleDateString('en-CA')];
  }

    const aFecha = (iso) => new Date(iso + 'T12:00:00');
  const sumar = (iso, dias) => { const d = aFecha(iso); d.setDate(d.getDate() + dias); return d.toLocaleDateString('en-CA'); };
  const semanaDe = (iso) => { const d = aFecha(iso); const lun = sumar(iso, -((d.getDay() + 6) % 7)); return [lun, sumar(lun, 6)]; };
  const mesDe = (iso) => { const d = aFecha(iso), y = d.getFullYear(), m = d.getMonth(); return [new Date(y, m, 1, 12).toLocaleDateString('en-CA'), new Date(y, m + 1, 0, 12).toLocaleDateString('en-CA')]; };
  const rangoHist = (modo, ref) => (modo === 'mes' ? mesDe(ref) : semanaDe(ref));
  // mueve el período del historial: una semana o un mes entero (d = -1 / +1)
  function moverHist(d) {
    if (H.modo === 'mes') { const x = aFecha(H.desde); x.setMonth(x.getMonth() + d, 1); [H.desde, H.hasta] = mesDe(x.toLocaleDateString('en-CA')); }
    else { if (H.modo === 'rango') H.modo = 'semana'; [H.desde, H.hasta] = semanaDe(sumar(H.desde, 7 * d)); }
  }

  async function montar(contenedor, { abrir } = {}) {
    el = contenedor;
    if (!H.desde) { [H.desde, H.hasta] = semanaActual(); H.modo = 'semana'; }
    if (!C.hasta) C.hasta = hoyISO();
    if (abrir) tab = abrir;
    el.onclick = onClick; el.onchange = onChange;
    await pintar();
  }

  async function pintar() {
    el.innerHTML = `<h1>Ganancias</h1><div class="tabs">${TABS.map(([k, t]) => `<button class="tab ${k === tab ? 'on' : ''}" data-acc="tab" data-k="${k}">${t}</button>`).join('')}</div><div id="g-cuerpo"></div>`;
    try { $('#g-cuerpo', el).innerHTML = await VISTA[tab](); } catch (e) { if (e.status !== 401) toast(e.message, { error: true }); }
  }

  // ---------- Resumen ----------
  async function resumen() {
    const r = await api('GET', `/api/ganancias/resumen?tipo=${R.tipo}&offset=${R.offset}`);
    const p = r.periodo;
    const etiqueta = p.tipo === 'mes' ? nombreMes(p.desde) : `${fdia(p.desde)} al ${fdia(p.hasta)}`;
    const actual = p.offset === 0 ? (p.tipo === 'mes' ? 'Este mes' : 'Esta semana') : p.offset === -1 ? (p.tipo === 'mes' ? 'Mes pasado' : 'Semana pasada') : '';
    const max = Math.max(1, ...r.dias.map((d) => d.total));
    const largo = r.dias.length > 8;
    return `${r.horas_pendientes ? `<div class="aviso">Hay ${r.horas_pendientes} servicio(s) de color con horas pendientes. <button class="btn-lnk" data-acc="tab" data-k="historial">Completarlas en el historial</button></div>` : ''}
      <div class="per-nav"><div class="seg"><button class="${p.tipo === 'semana' ? 'on' : ''}" data-acc="tipo" data-t="semana">Semana</button><button class="${p.tipo === 'mes' ? 'on' : ''}" data-acc="tipo" data-t="mes">Mes</button></div>
        <div class="per-pill">${chev('per', 'data-d="-1"', '‹')}<div class="per-lbl"><b>${h(etiqueta)}</b>${actual ? `<small>${actual}</small>` : ''}</div>${chev('per', 'data-d="1"', '›', p.offset >= 0)}</div>
        ${p.offset < 0 ? '<button class="btn-lnk" data-acc="per-hoy">Volver a hoy</button>' : ''}</div>
      <div class="kpis"><div class="panel kpi"><div class="eyebrow">Ganancia de la pelu</div><div class="grande">${peso(p.ganancia)}</div>
          <div class="tot"><div><span>Cobrado (${p.cobros} cobros)</span><span>${peso(p.total)}</span></div><div><span>Pagos al personal</span><span>− ${peso(p.pagos_empleados)}</span></div><div><span>Gastos</span><span>− ${peso(p.gastos)}</span></div></div></div>
        <div class="panel"><div class="eyebrow">Cobros por día</div><div class="barras ${largo ? 'mes' : ''}">${r.dias.map((d, i) => `<div class="barra" title="${fdia(d.dia)}: ${peso(d.total)}">${largo ? '' : `<span class="v">${d.total ? peso(d.total).replace('$ ', '') : ''}</span>`}<i class="${d.total ? '' : 'cero'}" style="height:${Math.round(d.total / max * 100)}%"></i><span>${largo ? Number(d.dia.slice(8)) : DIAS[i]}</span></div>`).join('')}</div></div></div>
      <div class="panel"><div class="eyebrow">A pagar al personal (desde el último cierre de caja)</div>
        ${r.a_pagar.length ? `<table class="tabla"><tr><th>Empleado</th><th class="r">Pagos</th><th class="r">Adelantos</th><th class="r">A pagar</th></tr>${r.a_pagar.map((e) => `<tr><td>${conAv(e.empleado)}</td><td class="r">${peso(e.pagos)}</td><td class="r">− ${peso(e.adelantos)}</td><td class="r"><b>${peso(e.neto)}</b></td></tr>`).join('')}</table>` : '<p class="nota">Todavía no hay empleados cargados.</p>'}</div>`;
  }

  // ---------- Historial ----------
  async function historial() {
    const l = await api('GET', `/api/cobros?desde=${H.desde}&hasta=${H.hasta}`);
    const validos = l.filter((c) => !c.anulado);
    const sigDesde = H.modo === 'mes' ? mesDe(sumar(H.hasta, 1))[0] : sumar(H.desde, 7);
    const etiqueta = H.modo === 'mes' ? nombreMes(H.desde) : `${fdia(H.desde)} al ${fdia(H.hasta)}`;
    return `<div class="panel barra-per"><div class="per-nav"><div class="seg"><button class="${H.modo === 'semana' ? 'on' : ''}" data-acc="h-modo" data-m="semana">Semana</button><button class="${H.modo === 'mes' ? 'on' : ''}" data-acc="h-modo" data-m="mes">Mes completo</button></div>
        <div class="per-pill">${chev('h-mover', 'data-d="-1"', '‹')}<div class="per-lbl"><b>${h(etiqueta)}</b>${H.modo === 'mes' ? `<small>${l.length} ${l.length === 1 ? 'cobro' : 'cobros'} del mes</small>` : ''}</div>${chev('h-mover', 'data-d="1"', '›', sigDesde > hoyISO())}</div>
        <button class="btn-lnk" data-acc="esta-semana">Hoy</button></div>
      <div class="filtro"><label>Desde <input type="date" data-campo="h-desde" value="${H.desde}"></label><label>Hasta <input type="date" data-campo="h-hasta" value="${H.hasta}"></label></div></div>

      <div class="panel">${l.length ? `<table class="tabla"><tr><th>Fecha</th><th>Clienta</th><th>Servicios</th><th class="r">Precio final</th><th></th></tr>
      ${l.map((c) => `<tr class="fila-cobro ${c.anulado ? 'anulado' : ''}" data-acc="ver" data-id="${c.id}"><td>${fdia(c.fecha)}</td><td class="${c.clienta ? '' : 'sin'}">${c.clienta ? conAv(c.clienta) : '— Sin asignar'}</td>
        <td>${c.servicios.map((s) => h(s.recorrido.replaceAll(' › ', ' · '))).join('<br>')}</td><td class="r">${peso(c.total)}</td>
        <td>${c.anulado ? '<span class="tag mal">Anulado</span>' : ''}${c.horas_pendientes ? '<span class="tag aviso-t">Horas pendientes</span>' : ''}${c.cierre_id ? '<span class="tag">Cerrado</span>' : ''}</td></tr>`).join('')}
      <tr class="pie"><td colspan="3">Total (${validos.length} cobros)</td><td class="r"><b>${peso(validos.reduce((a, c) => a + c.total, 0))}</b></td><td></td></tr></table>` : '<p class="nota">No hay cobros en estas fechas.</p>'}</div>`;
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
      <div class="panel">${l.length ? `<table class="tabla"><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th class="r">Monto</th><th></th></tr>${l.map((m) => `<tr><td>${fdia(m.fecha)}</td><td><span class="tag t-${m.tipo}">${NOM[m.tipo]}${m.empleado ? ' · ' + h(m.empleado) : ''}</span></td><td>${h(m.concepto || '')}</td><td class="r">${peso(m.monto)}</td><td><button class="btn-lnk" data-acc="mv-anular" data-id="${m.id}">Anular</button></td></tr>`).join('')}</table>
      <p class="nota">Solo se muestran los movimientos sin cerrar.</p>` : '<p class="nota">No hay movimientos sin cerrar.</p>'}</div>`;
  }

  // ---------- Pagos al personal (historial, sale de los cierres de caja) ----------
  async function pagos() {
    const [emps, r] = await Promise.all([api('GET', '/api/empleados'), api('GET', `/api/cierres/pagos?${P.mes ? `mes=${P.mes}&` : ''}empleado_id=${P.emp}`)]);
    P.mes = r.mes;
    const i = r.meses.indexOf(r.mes);
    return `<div class="per-nav"><label class="filtro">Empleado <select data-campo="p-emp"><option value="">Todos</option>${emps.map((e) => `<option value="${e.id}" ${String(e.id) === String(P.emp) ? 'selected' : ''}>${h(e.nombre)}</option>`).join('')}</select></label>
        <span class="sp"></span><div class="per-pill">${chev('pmes', `data-m="${r.meses[i + 1] || ''}"`, '‹', !r.meses[i + 1])}<div class="per-lbl"><b>${r.mes ? nombreMes(r.mes) : 'Sin pagos'}</b></div>${chev('pmes', `data-m="${i > 0 ? r.meses[i - 1] : ''}"`, '›', !(i > 0))}</div></div>
      ${r.filas.length ? `<div class="panel"><table class="tabla"><tr><th>Cierre</th><th>Empleado</th><th class="r">Por %</th><th class="r">Por horas</th><th class="r">Total</th><th class="r">Adelantos</th><th class="r">Pagado</th></tr>
        ${r.filas.map((f) => `<tr><td>${fdia(f.hasta)}</td><td>${conAv(f.empleado)}</td><td class="r">${peso(f.por_porcentaje)}</td><td class="r">${peso(f.por_horas)}</td><td class="r">${peso(f.pago_total)}</td><td class="r">− ${peso(f.adelantos)}</td><td class="r"><b>${peso(f.neto)}</b></td></tr>`).join('')}</table></div>
        <div class="panel" style="margin-top:24px"><div class="eyebrow">Total del mes por empleado</div><table class="tabla">${r.totales.map((t) => `<tr><td>${conAv(t.empleado)}</td><td class="r">${peso(t.pago_total)}</td><td class="r">− ${peso(t.adelantos)}</td><td class="r"><b>${peso(t.neto)}</b></td></tr>`).join('')}</table></div>`
        : '<p class="nota">Todavía no hay pagos registrados: cada vez que cerrás la caja queda anotado lo que se le pagó a cada empleado.</p>'}`;
  }

  // ---------- Cierre de caja ----------
  async function cierre() {
    const [p, lista] = await Promise.all([api('GET', `/api/cierres/previa?hasta=${C.hasta}`), api('GET', '/api/cierres')]);
    const vivos = lista.filter((c) => !c.anulado);
    const vacio = !p.cantidad_cobros && !p.movimientos, bloqueado = p.pendientes.length > 0;
    const grupos = [];                                   // cierres anteriores agrupados por mes
    for (const c of vivos) { const ym = c.hasta.slice(0, 7); let g = grupos.find((x) => x.ym === ym); if (!g) grupos.push((g = { ym, items: [] })); g.items.push(c); }
    C.i = Math.max(0, Math.min(C.i, grupos.length - 1));
    const g = grupos[C.i];
    return `<div class="cierre-grid"><div class="panel"><div class="cab"><div><div class="eyebrow">Vista previa</div><h2>Cerrar hasta el</h2></div>
        <input type="date" data-campo="c-hasta" value="${C.hasta}" max="${hoyISO()}" style="width:auto"></div>
      ${bloqueado ? `<div class="err">Faltan las horas de ${p.pendientes.length} servicio(s) de color. <button class="btn-lnk" data-acc="tab" data-k="historial">Completarlas en el historial</button></div>` : ''}
      <div class="tot" style="margin-top:14px"><div><span>Cobros incluidos</span><span>${p.cantidad_cobros}</span></div><div><span>Total cobrado</span><span>${peso(p.total_cobrado)}</span></div>
        <div><span>Pagos al personal</span><span>− ${peso(p.pagos_empleados)}</span></div><div><span>Gastos</span><span>− ${peso(p.gastos)}</span></div><div><span>Retiros (no restan ganancia)</span><span>${peso(p.retiros)}</span></div></div>
      <div class="saldo"><span>Ganancia de la pelu</span><b>${peso(p.ganancia_local)}</b></div>
      ${p.por_empleado.length ? `<table class="tabla"><tr><th>Empleado</th><th class="r">Pagos</th><th class="r">Adelantos</th><th class="r">Neto a pagar</th></tr>${p.por_empleado.map((e) => `<tr><td>${conAv(e.empleado)}</td><td class="r">${peso(e.pago_total)}</td><td class="r">− ${peso(e.adelantos)}</td><td class="r"><b>${peso(e.neto)}</b></td></tr>`).join('')}</table>` : ''}
      <label class="cam">Nota (opcional)</label><input type="text" data-campo="c-nota" value="${h(C.nota)}">
      <div style="margin-top:14px"><button class="btn-verde" data-acc="cerrar-caja" ${vacio || bloqueado ? 'disabled' : ''}>Cerrar caja</button></div></div>
      <div class="panel"><div class="hist-cab"><h3>Cierres anteriores</h3>${g ? `<div class="pager">${chev('cmes', 'data-d="1"', '‹', C.i >= grupos.length - 1)}<span><b>${nombreMes(g.ym)}</b></span>${chev('cmes', 'data-d="-1"', '›', C.i <= 0)}</div>` : ''}</div>
        ${g ? `<p class="nota">${g.items.length} ${g.items.length === 1 ? 'cierre' : 'cierres'} · cobrado ${peso(g.items.reduce((a, c) => a + c.total_cobrado, 0))} · ganancia ${peso(g.items.reduce((a, c) => a + c.ganancia_local, 0))}</p>
          <table class="tabla"><tr><th>Período</th><th class="r">Cobrado</th><th class="r">Ganancia</th><th></th></tr>${g.items.map((c) => `<tr><td>${fdia(c.desde || '')}${c.desde ? ' → ' : 'hasta '}${fdia(c.hasta)}</td><td class="r">${peso(c.total_cobrado)}</td><td class="r">${peso(c.ganancia_local)}</td><td>${c.id === vivos[0].id ? `<button class="btn-lnk" data-acc="anular-cierre" data-id="${c.id}">Anular último cierre</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="nota">Todavía no hay cierres.</p>'}</div></div>`;
  }

  const VISTA = { resumen, historial, movimientos, pagos, cierre };

  // ---------- eventos ----------
  const ACC = {
    tab: (d) => { tab = d.k; return pintar(); },
    tipo: (d) => { R.tipo = d.t; R.offset = 0; return pintar(); },
    per: (d) => { R.offset = Math.min(0, R.offset + Number(d.d)); return pintar(); },
    'per-hoy': () => { R.offset = 0; return pintar(); },
    pmes: (d) => { if (d.m) { P.mes = d.m; return pintar(); } },
    cmes: (d) => { C.i += Number(d.d); return pintar(); },
    'esta-semana': () => { [H.desde, H.hasta] = rangoHist(H.modo === 'mes' ? 'mes' : 'semana', hoyISO()); if (H.modo === 'rango') H.modo = 'semana'; return pintar(); },
    'h-mover': (d) => { moverHist(Number(d.d)); return pintar(); },
    'h-modo': (d) => { H.modo = d.m; [H.desde, H.hasta] = rangoHist(d.m, H.desde); return pintar(); },
    ver: (d) => Detalle.abrir(Number(d.id), () => { if (tab === 'historial') pintar(); }),
    'mv-agregar': async () => {
      const tipo = $('#mv-tipo', el).value, monto = Number($('#mv-monto', el).value);
      if (!(monto > 0)) return toast('Cargá un monto', { error: true });
      await api('POST', '/api/movimientos', { tipo, monto, concepto: $('#mv-concepto', el).value, empleado_id: tipo === 'adelanto' ? Number($('#mv-emp', el).value) : null });
      estadoGuardado(true); toast('Movimiento agregado'); return pintar();
    },
    'mv-anular': (d, b) => doble(b, '¿Seguro?', async () => { await api('POST', `/api/movimientos/${d.id}/anular`, {}); toast('Movimiento anulado'); await pintar(); }),
    'cerrar-caja': (_d, b) => doble(b, `Confirmar cierre hasta el ${fdia(C.hasta)}`, async () => {
      await api('POST', '/api/cierres', { hasta: C.hasta, nota: C.nota || null }); C.nota = ''; C.i = 0; estadoGuardado(true); toast('Caja cerrada'); await pintar();
    }),
    'anular-cierre': (d, b) => doble(b, '¿Seguro? Los cobros vuelven a quedar abiertos', async () => { await api('POST', `/api/cierres/${d.id}/anular`, {}); toast('Cierre anulado'); await pintar(); }),
  };

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]');
    if (!b || b.disabled || !ACC[b.dataset.acc]) return;
    try { await ACC[b.dataset.acc](b.dataset, b); } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
  }
  function onChange(ev) {
    const t = ev.target, c = t.dataset.campo;
    if ((c === 'h-desde' || c === 'h-hasta') && !t.value) return;
    if (c === 'h-desde') { H.desde = t.value; H.modo = 'rango'; pintar(); }
    else if (c === 'h-hasta') { H.hasta = t.value; H.modo = 'rango'; pintar(); }
    else if (c === 'c-hasta') { C.hasta = t.value || hoyISO(); pintar(); }
    else if (c === 'c-nota') C.nota = t.value;
    else if (c === 'p-emp') { P.emp = t.value; P.mes = null; pintar(); }
    else if (c === 'mv-tipo') $('#mv-emp', el).hidden = t.value !== 'adelanto';
  }

  return { montar };
})();