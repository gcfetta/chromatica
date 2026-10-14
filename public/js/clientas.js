// Pantalla CLIENTAS: lista, ficha editable e historial de turnos cobrados.
const Clientas = (() => {
  let el, sel = null, q = '';

  async function montar(contenedor) {
    el = contenedor; el.onclick = onClick; el.oninput = onInput; el.onchange = null;
    el.innerHTML = `<h1>Clientas</h1><div class="cli"><div class="panel"><input type="text" id="cl-buscar" placeholder="Buscar clienta" value="${h(q)}">
      <button class="btn-oro" data-acc="nueva" style="margin-top:10px;width:100%">＋ Nueva clienta</button><div class="cli-lista" id="cl-lista"></div></div><div id="cl-ficha"></div></div>`;
    await lista();
    if (sel) await ficha(sel);
  }

  async function lista() {
    const l = await api('GET', '/api/clientes?q=' + encodeURIComponent(q));
    $('#cl-lista', el).innerHTML = l.length ? l.map((c) => `<button data-acc="ver" data-id="${c.id}" class="${c.id === sel ? 'on' : ''}">${h(c.nombre)}<small>${h(c.contacto || '')}</small></button>`).join('') : '<p class="nota">Sin resultados.</p>';
  }

  async function ficha(id) {
    sel = id;
    const c = await api('GET', `/api/clientes/${id}`);
    const porCobro = new Map();
    for (const r of c.historial) {
      if (!porCobro.has(r.cobro_id)) porCobro.set(r.cobro_id, { id: r.cobro_id, fecha: r.fecha, total: r.total, ficha: r.ficha, anulado: r.anulado, servicios: [] });
      porCobro.get(r.cobro_id).servicios.push(r);
    }
    const visitas = [...porCobro.values()], validas = visitas.filter((v) => !v.anulado);
    const campo = (k, t, filas = 0) => `<label class="cam">${t}</label>${filas ? `<textarea rows="${filas}" data-k="${k}">${h(c[k] || '')}</textarea>` : `<input type="text" data-k="${k}" value="${h(c[k] || '')}">`}`;
    $('#cl-ficha', el).innerHTML = `<div class="panel" style="background:#fff"><div class="eyebrow">Ficha</div><h2>${h(c.nombre)}</h2>
      <div class="resumen-cli"><div><b>${validas.length}</b>turnos</div><div><b>${peso(validas.reduce((a, v) => a + v.total, 0))}</b>total cobrado</div><div><b>${validas.length ? h(validas[0].fecha.slice(0, 10).split('-').reverse().join('/')) : '—'}</b>última visita</div></div>
      <div class="fila2">${campo('nombre', 'Nombre')}${campo('contacto', 'Contacto')}</div>${campo('ficha', 'Ficha', 3)}${campo('observacion', 'Observación', 2)}${campo('notas_importantes', 'Notas importantes', 2)}
      <div style="margin-top:12px"><button class="btn-verde" style="width:auto" data-acc="guardar">Guardar ficha</button></div>
      <h3 style="margin:24px 0 10px">Historial de turnos</h3>
      ${visitas.length ? visitas.map((v) => `<div class="visita ${v.anulado ? 'anulado' : ''}" data-acc="cobro" data-id="${v.id}"><div class="t"><b>${h(v.fecha.slice(0, 10).split('-').reverse().join('/'))}</b><span>${peso(v.total)}${v.anulado ? ' <span class="tag mal">Anulado</span>' : ''}</span></div>
        <ul>${v.servicios.map((s) => `<li>${h(s.recorrido.replaceAll(' › ', ' · '))} · ${peso(s.precio_cobrado)}</li>`).join('')}</ul>${v.ficha ? `<small class="nota">Ficha del turno: ${h(v.ficha)}</small>` : ''}</div>`).join('') : '<p class="nota">Todavía no tiene turnos cobrados.</p>'}</div>`;
    await lista();
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    try {
      const a = b.dataset.acc;
      if (a === 'ver') await ficha(Number(b.dataset.id));
      else if (a === 'cobro') await Detalle.abrir(Number(b.dataset.id), () => ficha(sel));
      else if (a === 'nueva') {
        const nombre = ($('#cl-buscar', el).value || '').trim();
        if (!nombre) return toast('Escribí el nombre en el buscador y tocá de nuevo', { error: true });
        const c = await api('POST', '/api/clientes', { nombre }); q = ''; $('#cl-buscar', el).value = ''; await ficha(c.id); toast('Clienta creada');
      } else if (a === 'guardar') {
        const body = {}; el.querySelectorAll('#cl-ficha [data-k]').forEach((i) => { body[i.dataset.k] = i.value.trim(); });
        await api('PUT', `/api/clientes/${sel}`, body); estadoGuardado(true); toast('Ficha guardada'); await ficha(sel);
      }
    } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
  }
  let t;
  function onInput(ev) { if (ev.target.id !== 'cl-buscar') return; q = ev.target.value; clearTimeout(t); t = setTimeout(lista, 200); }

  return { montar };
})();