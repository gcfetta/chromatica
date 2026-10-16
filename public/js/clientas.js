// Pantalla CLIENTAS: lista con scroll a la izquierda; a la derecha ficha compacta e historial de turnos paginado.
const Clientas = (() => {
  const POR_PAG = 3;
  let el, sel = null, q = '', pag = 0, timer;
  const fechaLarga = (s) => s.slice(0, 10).split('-').reverse().join('/');

  async function montar(contenedor) {
    el = contenedor; el.classList.add('fija');
    el.onclick = onClick; el.oninput = onInput; el.onchange = null;
    el.innerHTML = `<h1>Clientas</h1><div class="cli"><aside class="panel cli-izq"><input type="text" id="cl-buscar" placeholder="Buscar por nombre o contacto" value="${h(q)}">
      <button class="btn-oro" data-acc="nueva" style="margin-top:10px;width:100%">＋ Nueva clienta</button><div class="cli-lista" id="cl-lista"></div></aside><section class="cli-der" id="cl-ficha"></section></div>`;
    const l = await lista();
    if (!sel && l.length) sel = l[0].id;
    if (sel) await ficha(sel); else $('#cl-ficha', el).innerHTML = '<p class="nota">Todavía no hay clientas. Escribí un nombre en el buscador y tocá "Nueva clienta".</p>';
  }

  async function lista() {
    const l = await api('GET', '/api/clientes?q=' + encodeURIComponent(q));
    $('#cl-lista', el).innerHTML = l.length ? l.map((c) => `<button data-acc="ver" data-id="${c.id}" class="${c.id === sel ? 'on' : ''}">${h(c.nombre)}<small>${h(c.contacto || '')}</small></button>`).join('') : '<p class="nota">Sin resultados.</p>';
    return l;
  }

  async function ficha(id, conservarPag = false) {
    if (id !== sel || !conservarPag) pag = 0;
    sel = id;
    const c = await api('GET', `/api/clientes/${id}`);
    const porCobro = new Map();
    for (const r of c.historial) {
      if (!porCobro.has(r.cobro_id)) porCobro.set(r.cobro_id, { id: r.cobro_id, fecha: r.fecha, total: r.total, ficha: r.ficha, anulado: r.anulado, servicios: [] });
      porCobro.get(r.cobro_id).servicios.push(r);
    }
    const visitas = [...porCobro.values()], validas = visitas.filter((v) => !v.anulado);
    const paginas = Math.max(1, Math.ceil(visitas.length / POR_PAG));
    pag = Math.min(pag, paginas - 1);
    const ver = visitas.slice(pag * POR_PAG, pag * POR_PAG + POR_PAG);
    const campo = (k, t, span, filas = 0) => `<div style="grid-column:span ${span}"><label class="cam">${t}</label>${filas ? `<textarea rows="${filas}" data-k="${k}">${h(c[k] || '')}</textarea>` : `<input type="text" data-k="${k}" value="${h(c[k] || '')}">`}</div>`;
    $('#cl-ficha', el).innerHTML = `<div class="panel cli-datos"><div class="cli-cab"><div><div class="eyebrow">Ficha</div><h2>${h(c.nombre)}</h2></div>
        <div class="resumen-cli"><div><b>${validas.length}</b>turnos</div><div><b>${peso(validas.reduce((a, v) => a + v.total, 0))}</b>total cobrado</div><div><b>${validas.length ? fechaLarga(validas[0].fecha) : '—'}</b>última visita</div></div>
        <button class="btn-verde" style="width:auto" data-acc="guardar">Guardar ficha</button></div>
      <div class="cli-campos">${campo('nombre', 'Nombre', 3)}${campo('contacto', 'Contacto', 3)}${campo('ficha', 'Ficha', 2, 2)}${campo('observacion', 'Observación', 2, 2)}${campo('notas_importantes', 'Notas importantes', 2, 2)}</div></div>
      <div class="panel cli-hist"><div class="hist-cab"><h3>Historial de turnos</h3>
        <div class="pager"><button class="chev" data-acc="pag" data-d="-1" ${pag === 0 ? 'disabled' : ''}>‹</button><span>${visitas.length ? `${pag * POR_PAG + 1}–${pag * POR_PAG + ver.length} de ${visitas.length}` : '0'}</span><button class="chev" data-acc="pag" data-d="1" ${pag >= paginas - 1 ? 'disabled' : ''}>›</button></div></div>
        <div class="hist-lista">${ver.length ? ver.map((v) => `<div class="visita ${v.anulado ? 'anulado' : ''}" data-acc="cobro" data-id="${v.id}"><div class="t"><b>${fechaLarga(v.fecha)}</b><span>${peso(v.total)}${v.anulado ? ' <span class="tag mal">Anulado</span>' : ''}</span></div>
          <ul>${v.servicios.map((s) => `<li>${h(s.recorrido.replaceAll(' › ', ' · '))} · ${peso(s.precio_cobrado)}</li>`).join('')}</ul>${v.ficha ? `<small class="nota">Ficha del turno: ${h(v.ficha)}</small>` : ''}</div>`).join('') : '<p class="nota">Todavía no tiene turnos cobrados.</p>'}</div></div>`;
    await lista();
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    try {
      const a = b.dataset.acc;
      if (a === 'ver') await ficha(Number(b.dataset.id));
      else if (a === 'pag') { pag += Number(b.dataset.d); await ficha(sel, true); }
      else if (a === 'cobro') await Detalle.abrir(Number(b.dataset.id), () => ficha(sel, true));
      else if (a === 'nueva') {
        const nombre = ($('#cl-buscar', el).value || '').trim();
        if (!nombre) return toast('Escribí el nombre en el buscador y tocá de nuevo', { error: true });
        const c = await api('POST', '/api/clientes', { nombre }); q = ''; $('#cl-buscar', el).value = ''; await ficha(c.id); toast('Clienta creada');
      } else if (a === 'guardar') {
        const body = {}; el.querySelectorAll('#cl-ficha [data-k]').forEach((i) => { body[i.dataset.k] = i.value.trim(); });
        await api('PUT', `/api/clientes/${sel}`, body); estadoGuardado(true); toast('Ficha guardada'); await ficha(sel, true);
      }
    } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
  }
  function onInput(ev) { if (ev.target.id !== 'cl-buscar') return; q = ev.target.value; clearTimeout(timer); timer = setTimeout(lista, 200); }

  return { montar };
})();