// Pantalla SERVICIOS Y PRECIOS: carta visual por grupo, ABM completo (servicios, opciones, categorías) y "actualizar precios %".
const Servicios = (() => {
  const ORDEN = ['Cortes', 'Mechas', 'Retoques deco', 'Coloraciones', 'Tratamientos'];
  const GRUPOS_CAT = { color: ['Mechas', 'Retoques deco', 'Coloraciones'], nutri: ['Tratamientos'], corte: ['Cortes'] };
  let el, datos = [], cats = [], filtro = 'Todos', editar = false;
  const A = { abierto: false, pct: '', grupo: 'todos', red: 500, prev: null };
  const niveles = () => cats.map((c) => c.nombre);
  // Categorías (Plus, Premium, Mega premium…): se guardan en el catálogo y van como primer tramo del nombre de la opción
  const estrellas = (n) => { const i = niveles().indexOf(n); return i < 0 ? '' : '★'.repeat(i + 1) + ' '; };
  const nivelDe = (et) => niveles().find((n) => et === n || et.startsWith(n + ' · ')) || '';
  const opcionDe = (et, n) => (n ? et.slice(n.length + 3) : et);
  const etiquetaDe = (n, o) => { o = (o || '').trim(); return n ? (o ? `${n} · ${o}` : n) : (o || 'Único'); };
  const opcionesNivel = (sel) => `<option value="">Sin categoría</option>${niveles().map((n) => `<option ${n === sel ? 'selected' : ''}>${h(n)}</option>`).join('')}`;

  async function montar(contenedor) {
    el = contenedor; el.onclick = onClick; el.onchange = onChange; el.oninput = null;
    await cargar(); pintar();
  }

  async function cargar() {
    const [filas, c] = await Promise.all([api('GET', '/api/servicios'), api('GET', '/api/servicios/categorias')]), mapa = new Map();
    cats = c;
    for (const f of filas) {
      if (!mapa.has(f.id)) mapa.set(f.id, { id: f.id, nombre: f.nombre, categoria: f.categoria, grupo: f.grupo, subgrupo: f.subgrupo, duracion: f.duracion_texto, variantes: [] });
      mapa.get(f.id).variantes.push(f);
    }
    datos = [...mapa.values()];
  }
  const recargar = async (msg) => { await cargar(); pintar(); estadoGuardado(true); if (msg) toast(msg); };
  const gruposDe = (cat) => [...new Set([...(GRUPOS_CAT[cat] || []), ...datos.filter((x) => x.categoria === cat).map((x) => x.grupo)])];
  const grupos = () => { const hay = [...new Set(datos.map((s) => s.grupo))]; return [...ORDEN.filter((g) => hay.includes(g)), ...hay.filter((g) => !ORDEN.includes(g))]; };

  function tarjeta(s) {
    const secs = [];
    for (const v of s.variantes) {
      const n = nivelDe(v.etiqueta); let x = secs.find((q) => q.n === n); if (!x) secs.push((x = { n, filas: [] }));
      x.filas.push(v);
    }
    secs.sort((a, b) => niveles().indexOf(a.n) - niveles().indexOf(b.n));
    const fila = (v, n, sec) => {
      const o = opcionDe(v.etiqueta, n), efe = s.categoria === 'corte' ? '' : `<small>Efectivo ${peso(v.precio_efectivo)}</small>`;
      if (!editar) return `<div class="vfila"><span>${['Único', 'Desde'].includes(v.etiqueta) ? (v.precio_desde ? 'Desde' : '') : h(o)}</span><span><span class="p">${peso(v.precio_tarjeta)}</span>${efe}</span></div>`;
      const i = sec.indexOf(v);
      return `<div class="vfila ed"><input type="text" data-vl="${v.variante_id}" data-n="${h(n)}" value="${h(o)}" placeholder="${n ? 'Opción (opcional)' : 'Único'}">
        <input type="number" min="1" data-v="${v.variante_id}" value="${v.precio_tarjeta}"><label class="desde" title="Precio desde"><input type="checkbox" data-vd="${v.variante_id}" ${v.precio_desde ? 'checked' : ''}> desde</label>
        <span class="ctl"><button class="mini-b" data-acc="var-mover" data-id="${v.variante_id}" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button><button class="mini-b" data-acc="var-mover" data-id="${v.variante_id}" data-d="1" ${i === sec.length - 1 ? 'disabled' : ''} title="Bajar">↓</button><button class="mini-b" data-acc="var-borrar" data-id="${v.variante_id}" title="Eliminar opción">✕</button></span></div>`;
    };
    const usados = secs.map((x) => x.n), libres = niveles().filter((n) => !usados.includes(n));
    const bloque = (x) => `${x.n || editar ? `<div class="nivel">${x.n ? `${estrellas(x.n)}${h(x.n)}` : 'Sin categoría'}${editar ? `<span class="sp"></span><button class="btn-lnk" data-acc="var-nueva" data-s="${s.id}" data-n="${h(x.n)}">＋ Agregar</button>${x.n ? `<button class="btn-lnk" data-acc="cat-quitar" data-s="${s.id}" data-n="${h(x.n)}">Quitar categoría</button>` : ''}` : ''}</div>` : ''}${x.filas.map((v) => fila(v, x.n, x.filas)).join('')}`;
    const sib = datos.filter((q) => q.categoria === s.categoria && q.grupo === s.grupo && q.subgrupo === s.subgrupo), k = sib.indexOf(s);
    return `<div class="srv"><h3>${h(s.nombre)}${s.subgrupo ? `<span class="tagg">${h(s.subgrupo)}</span>` : ''}</h3>${s.duracion ? `<div class="dur">Duración promedio: ${h(s.duracion)}</div>` : ''}
    ${editar ? `<div class="srv-ctl"><button class="btn-lnk" data-acc="srv-editar" data-s="${s.id}">✎ Editar</button><button class="mini-b" data-acc="srv-mover" data-s="${s.id}" data-d="-1" ${k === 0 ? 'disabled' : ''} title="Subir">↑</button><button class="mini-b" data-acc="srv-mover" data-s="${s.id}" data-d="1" ${k === sib.length - 1 ? 'disabled' : ''} title="Bajar">↓</button><span class="sp"></span><button class="btn-lnk" data-acc="srv-borrar" data-s="${s.id}">Eliminar servicio</button></div>` : ''}
    ${secs.map(bloque).join('')}
    ${editar ? `<div class="srv-pie"><button class="btn-lnk" data-acc="var-nueva" data-s="${s.id}" data-n="">＋ Agregar opción</button>${libres.length ? `<span class="sp"></span><select data-addcat="${s.id}">${libres.map((n) => `<option>${h(n)}</option>`).join('')}</select><button class="btn-lnk" data-acc="cat-agregar" data-s="${s.id}">＋ Categoría</button>` : ''}</div>` : ''}</div>`;
  }

  function panelAct() {
    if (!A.abierto) return '';
    return `<div class="panel act"><div class="eyebrow">Actualizar precios</div>
      <div class="fila-act"><div><label>Porcentaje</label><input type="number" step="0.5" data-campo="pct" value="${h(A.pct)}" placeholder="Ej. 10" style="width:110px"></div>
        <div><label>Aplicar a</label><select data-campo="grupo"><option value="todos">Toda la carta</option>${grupos().map((g) => `<option ${A.grupo === g ? 'selected' : ''}>${h(g)}</option>`).join('')}</select></div>
        <div><label>Redondear a</label><select data-campo="red">${[100, 500, 1000].map((r) => `<option value="${r}" ${A.red === r ? 'selected' : ''}>${peso(r)}</option>`).join('')}</select></div>
        <button class="btn-oro" data-acc="previa">Ver cambios</button></div>
      ${A.prev ? `<div style="margin-top:12px"><p><b>${A.prev.cantidad}</b> precios van a cambiar. Por ejemplo:</p><table class="tabla">${A.prev.ejemplos.map((e) => `<tr><td>${h(e.servicio)} · ${h(e.variante)}</td><td class="r">${peso(e.antes)}</td><td class="r">→ <b>${peso(e.despues)}</b></td></tr>`).join('')}</table>
        <p class="nota">Los cobros ya hechos no cambian. Antes de aplicar conviene una copia de seguridad (se guarda el detalle de cada cambio en el historial).</p>
        <button class="btn-verde" style="width:auto;margin-top:8px" data-acc="aplicar">Aplicar ${A.pct > 0 ? '+' : ''}${h(A.pct)}%</button></div>` : ''}</div>`;
  }

  function pintar() {
    const lista = datos.filter((s) => filtro === 'Todos' || s.grupo === filtro);
    el.innerHTML = `<h1>Servicios y precios</h1>
      <div class="srv-barra"><div class="srv-chips">${['Todos', ...grupos()].map((g) => `<button class="chip ${g === filtro ? 'on' : ''}" data-acc="filtro" data-g="${h(g)}">${h(g)}</button>`).join('')}</div>
        <div class="srv-btns"><button class="btn-oro" data-acc="nuevo">＋ Nuevo servicio</button><button class="btn-oro" data-acc="categorias">Categorías</button><button class="btn-oro" data-acc="editar">${editar ? 'Terminar edición' : 'Editar carta'}</button><button class="btn-oro" data-acc="abrir-act">Actualizar precios %</button></div></div>
    ${panelAct()}<p class="nota" style="margin-bottom:12px">${editar ? 'Editá nombres, precios (de lista; el de efectivo se calcula solo), orden y categorías. Los cortes tienen un único precio.' : 'Precio grande: tarjeta o cuotas. Efectivo y transferencia, con descuento.'}</p>
      <div class="srv-grid">${lista.map(tarjeta).join('')}</div>`;
  }

  const ok = (fn) => async (...a) => { try { await fn(...a); } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); } };
  const secuencia = async (id, n, d) => { for (let i = 0; i < n; i++) await api('POST', `/api/servicios/variantes/${id}/mover`, { dir: d }); };

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b || b.disabled) return;
    const a = b.dataset.acc, sid = Number(b.dataset.s);
    try {
      if (a === 'filtro') { filtro = b.dataset.g; pintar(); }
      else if (a === 'editar') { editar = !editar; pintar(); }
      else if (a === 'nuevo') formNuevo();
      else if (a === 'categorias') await modalCategorias();
      else if (a === 'srv-editar') formServicio(sid);
      else if (a === 'var-nueva') formOpcion(sid, b.dataset.n || '');
      else if (a === 'cat-agregar') formOpcion(sid, el.querySelector(`[data-addcat="${sid}"]`).value);
      else if (a === 'srv-mover') { await api('POST', `/api/servicios/${sid}/mover`, { dir: Number(b.dataset.d) }); await recargar(); }
      else if (a === 'srv-borrar') doble(b, '¿Seguro? Se elimina el servicio', ok(async () => { await api('DELETE', `/api/servicios/${sid}`); await recargar('Servicio eliminado'); }));
      else if (a === 'cat-quitar') doble(b, '¿Seguro? Se quitan sus opciones', ok(async () => { await api('DELETE', `/api/servicios/${sid}/categoria`, { nombre: b.dataset.n }); await recargar('Categoría quitada de la card'); }));
      else if (a === 'var-borrar') doble(b, '¿Seguro?', ok(async () => { await api('DELETE', `/api/servicios/variantes/${b.dataset.id}`); await recargar('Opción eliminada'); }));
      else if (a === 'var-mover') {
        const v = datos.flatMap((x) => x.variantes).find((x) => x.variante_id === Number(b.dataset.id)), srv = datos.find((x) => x.variantes.includes(v));
        const n = nivelDe(v.etiqueta), d = Number(b.dataset.d), todas = srv.variantes, i = todas.indexOf(v);
        let j = i + d; while (todas[j] && nivelDe(todas[j].etiqueta) !== n) j += d;       // vecino de la misma categoría
        if (todas[j]) { await secuencia(v.variante_id, Math.abs(j - i), d); await recargar(); }
      }
      else if (a === 'abrir-act') { A.abierto = !A.abierto; A.prev = null; pintar(); }
      else if (a === 'previa') {
        A.prev = await api('POST', '/api/servicios/actualizar-precios', { porcentaje: Number(A.pct), grupo: A.grupo, redondeo: A.red });
        pintar();
      } else if (a === 'aplicar') doble(b, '¿Seguro? Cambia los precios de la carta', ok(async () => {
        const r = await api('POST', '/api/servicios/actualizar-precios', { porcentaje: Number(A.pct), grupo: A.grupo, redondeo: A.red, aplicar: true });
        A.abierto = false; A.prev = null; A.pct = ''; await recargar(`Precios actualizados (${r.cantidad})`);
      }));
    } catch (e) { toast(e.message, { error: true }); }
  }

  // ---------- filas de opción (en "Nuevo servicio") ----------
  const filaVar = () => '<div class="var-fila"><input type="text" placeholder="Opción (ej. Largo, Único)" data-e><input type="number" min="1" placeholder="Precio" data-p><label class="desde"><input type="checkbox" data-d> desde</label><button type="button" class="btn-lnk" data-x>Quitar</button></div>';
  const bloqueNuevo = (n) => `<div class="blk"><div class="blk-cab"><select data-bn>${opcionesNivel(n)}</select><span class="sp"></span><button type="button" class="btn-lnk" data-bq>Quitar categoría</button></div><div class="blk-rows">${filaVar()}</div><button type="button" class="btn-lnk" data-bm>＋ Agregar opción</button></div>`;

  function formNuevo() {
    const m = $('#modal');
    m.innerHTML = `<div class="ancho"><h2 style="font-size:26px">Nuevo servicio</h2>
      <div class="mod-grid"><div><label class="cam">Nombre</label><input id="ns-nombre" type="text"></div>
        <div><label class="cam">Tipo</label><select id="ns-cat"><option value="color">Color</option><option value="nutri">Nutri / tratamiento</option><option value="corte">Corte</option></select></div>
        <div><label class="cam">Grupo</label><input id="ns-grupo" type="text" list="ns-grupos" autocomplete="off"><datalist id="ns-grupos"></datalist></div>
        <div id="ns-sub-box" hidden><label class="cam">Corto o largo</label><select id="ns-sub"><option>Corto</option><option>Largo</option></select></div>
        <div id="ns-dur-box"><label class="cam">Duración promedio (opcional)</label><input id="ns-dur" type="text" placeholder="Ej. 3 a 5 hs"></div></div>
      <label class="cam">Precios por categoría (precio de lista: tarjeta o cuotas)</label><div id="ns-bloques"></div>
      <button type="button" class="btn-lnk" id="ns-mas">＋ Agregar categoría</button>
      <div class="mod-acc"><button class="btn-verde" id="ns-guardar">Guardar servicio</button><button class="btn-oro" id="ns-cancelar">Cancelar</button></div></div>`;
    const cat = () => $('#ns-cat', m).value, box = $('#ns-bloques', m);
    const sinPrecios = () => ![...m.querySelectorAll('[data-p]')].some((i) => i.value);
    const armar = () => {                      // color y nutri arrancan con Plus y Premium (si existen); los cortes sin categoría
      const base = cat() === 'corte' ? [''] : niveles().filter((n) => ['Plus', 'Premium'].includes(n));
      box.innerHTML = (base.length ? base : ['']).map(bloqueNuevo).join('');
    };
    const refrescar = () => {
      const g = gruposDe(cat()); $('#ns-grupos', m).innerHTML = g.map((x) => `<option value="${h(x)}">`).join(''); $('#ns-grupo', m).value = g[0] || '';
      $('#ns-sub-box', m).hidden = cat() !== 'corte'; $('#ns-dur-box', m).hidden = cat() === 'corte';
      if (sinPrecios()) armar();
    };
    armar(); refrescar();
    $('#ns-cat', m).onchange = refrescar;
    $('#ns-mas', m).onclick = () => { const usadas = [...m.querySelectorAll('[data-bn]')].map((x) => x.value); box.insertAdjacentHTML('beforeend', bloqueNuevo(niveles().find((n) => !usadas.includes(n)) || '')); };
    box.onclick = (ev) => {
      const t = ev.target, blk = t.closest('.blk'); if (!blk) return;
      if (t.dataset.bm !== undefined) blk.querySelector('.blk-rows').insertAdjacentHTML('beforeend', filaVar());
      else if (t.dataset.bq !== undefined && box.children.length > 1) blk.remove();
      else if (t.dataset.x !== undefined && blk.querySelector('.blk-rows').children.length > 1) t.closest('.var-fila').remove();
    };
    $('#ns-cancelar', m).onclick = () => cerrarCapa(m);
    $('#ns-guardar', m).onclick = ok(async () => {
      const variantes = [];
      for (const blk of m.querySelectorAll('.blk')) for (const f of blk.querySelectorAll('.var-fila')) {
        const precio = f.querySelector('[data-p]').value; if (!precio) continue;     // filas sin precio se ignoran
        variantes.push({ etiqueta: etiquetaDe(blk.querySelector('[data-bn]').value, f.querySelector('[data-e]').value), precio: Number(precio), desde: f.querySelector('[data-d]').checked });
      }
      await api('POST', '/api/servicios', { nombre: $('#ns-nombre', m).value, categoria: cat(), grupo: $('#ns-grupo', m).value, subgrupo: cat() === 'corte' ? $('#ns-sub', m).value : null, duracion_texto: $('#ns-dur', m).value, variantes });
      cerrarCapa(m); await recargar('Servicio agregado');
    });
    m.hidden = false;
  }

  function formOpcion(sid, nivel) {
    const s = datos.find((x) => x.id === sid), m = $('#modal');
    m.innerHTML = `<div class="ancho" style="width:min(460px,92vw)"><h2 style="font-size:24px">Nueva opción</h2><p class="nota">${h(s.nombre)}</p>
      <label class="cam">Categoría</label><select id="no-n">${opcionesNivel(nivel)}</select>
      <label class="cam">Nombre de la opción (opcional si tiene categoría)</label><input id="no-e" type="text" placeholder="Ej. Hasta media espalda">
      <label class="cam">Precio de lista</label><input id="no-p" type="number" min="1">
      <label class="desde" style="display:block;margin-top:8px"><input type="checkbox" id="no-d"> Precio «desde»</label>
      <div class="mod-acc"><button class="btn-verde" id="no-guardar">Guardar</button><button class="btn-oro" id="no-cancelar">Cancelar</button></div></div>`;
    $('#no-cancelar', m).onclick = () => cerrarCapa(m);
    $('#no-guardar', m).onclick = ok(async () => {
      await api('POST', `/api/servicios/${sid}/variantes`, { etiqueta: etiquetaDe($('#no-n', m).value, $('#no-e', m).value), precio: Number($('#no-p', m).value), desde: $('#no-d', m).checked });
      cerrarCapa(m); await recargar('Opción agregada');
    });
    m.hidden = false;
  }

  function formServicio(sid) {
    const s = datos.find((x) => x.id === sid), m = $('#modal');
    m.innerHTML = `<div class="ancho" style="width:min(520px,92vw)"><h2 style="font-size:24px">Editar servicio</h2>
      <label class="cam">Nombre</label><input id="es-n" type="text" value="${h(s.nombre)}">
      <label class="cam">Grupo</label><input id="es-g" type="text" list="es-gs" value="${h(s.grupo)}"><datalist id="es-gs">${gruposDe(s.categoria).map((x) => `<option value="${h(x)}">`).join('')}</datalist>
      ${s.categoria === 'corte' ? `<label class="cam">Corto o largo</label><select id="es-s"><option ${s.subgrupo === 'Corto' ? 'selected' : ''}>Corto</option><option ${s.subgrupo === 'Largo' ? 'selected' : ''}>Largo</option></select>`
        : `<label class="cam">Duración promedio</label><input id="es-d" type="text" value="${h(s.duracion || '')}">`}
      <div class="mod-acc"><button class="btn-verde" id="es-ok">Guardar</button><button class="btn-oro" id="es-x">Cancelar</button></div></div>`;
    $('#es-x', m).onclick = () => cerrarCapa(m);
    $('#es-ok', m).onclick = ok(async () => {
      const body = { nombre: $('#es-n', m).value, grupo: $('#es-g', m).value };
      if (s.categoria === 'corte') body.subgrupo = $('#es-s', m).value; else body.duracion_texto = $('#es-d', m).value;
      await api('PUT', `/api/servicios/${sid}`, body); cerrarCapa(m); await recargar('Servicio guardado');
    });
    m.hidden = false;
  }

  // ---------- categorías: alta, renombrar, ordenar, eliminar ----------
  async function modalCategorias() {
    const m = $('#modal');
    const pintarM = () => {
      m.innerHTML = `<div class="ancho" style="width:min(520px,92vw)"><h2 style="font-size:24px">Categorías</h2>
        <p class="nota">Las categorías (Plus, Premium, Mega premium…) están disponibles al crear o editar cualquier servicio. El orden define las estrellas.</p>
        ${cats.map((c, i) => `<div class="cat-fila"><input type="text" data-cn="${h(c.nombre)}" value="${h(c.nombre)}"><small>${c.en_uso ? `en uso: ${c.en_uso}` : 'sin uso'}</small>
          <button class="mini-b" data-ca="sub" data-n="${h(c.nombre)}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="mini-b" data-ca="baj" data-n="${h(c.nombre)}" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-lnk" data-ca="del" data-n="${h(c.nombre)}">Eliminar</button></div>`).join('') || '<p class="nota">Todavía no hay categorías.</p>'}
        <div class="cat-fila" style="margin-top:12px"><input type="text" id="ct-nueva" placeholder="Nueva categoría (ej. Mega premium)"><span></span><button class="btn-oro" data-ca="add">Agregar</button></div>
        <div class="mod-acc"><button class="btn-oro" id="ct-cerrar">Cerrar</button></div></div>`;
      $('#ct-cerrar', m).onclick = async () => { cerrarCapa(m); await recargar(); };
    };
    const refrescar = async () => { cats = await api('GET', '/api/servicios/categorias'); pintarM(); };
    m.onclick = ok(async (ev) => {
      const b = ev.target.closest('[data-ca]'); if (!b) return; const n = b.dataset.n, a = b.dataset.ca;
      if (a === 'add') { const v = $('#ct-nueva', m).value; await api('POST', '/api/servicios/categorias', { nombre: v }); await refrescar(); }
      else if (a === 'sub' || a === 'baj') { await api('PUT', '/api/servicios/categorias', { nombre: n, dir: a === 'sub' ? -1 : 1 }); await refrescar(); }
      else if (a === 'del') doble(b, '¿Seguro?', ok(async () => { await api('DELETE', '/api/servicios/categorias', { nombre: n }); await refrescar(); }));
    });
    m.onchange = ok(async (ev) => {
      const t = ev.target; if (t.dataset.cn === undefined) return;
      try { await api('PUT', '/api/servicios/categorias', { nombre: t.dataset.cn, nuevo: t.value }); } finally { await refrescar(); }
    });
    m.alCerrar = () => { m.onclick = null; m.onchange = null; };
    pintarM(); m.hidden = false;
  }

  async function onChange(ev) {
    const t = ev.target;
    if (t.dataset.campo) { A[t.dataset.campo] = t.dataset.campo === 'red' ? Number(t.value) : t.value; A.prev = null; return; }
    try {
      if (t.dataset.vl) await api('PUT', `/api/servicios/variantes/${t.dataset.vl}`, { etiqueta: etiquetaDe(t.dataset.n, t.value) });
      else if (t.dataset.vd) await api('PUT', `/api/servicios/variantes/${t.dataset.vd}`, { desde: t.checked });
      else if (t.dataset.v) await api('PUT', `/api/servicios/variantes/${t.dataset.v}`, { precio: Number(t.value) });
      else return;
      await recargar();
    } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); await cargar(); pintar(); }
  }
  return { montar };
})();