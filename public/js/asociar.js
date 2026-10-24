// Popup para asociar turnos (cobros) del historial a una clienta: calendario + tabla por día (o semana).
const Asociar = (() => {
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const suma = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunes = (s) => suma(s, -((parse(s).getDay() + 6) % 7));
  let m, cli, ref, modo, alCambiar;

  function abrir(clienteId, nombre, cb) {
    cli = clienteId; alCambiar = cb; ref = hoyISO(); modo = 'semana';
    m = $('#modal');
    m.innerHTML = `<div class="ancho asoc"><h2>Asociar turnos a ${h(nombre)}</h2><div id="as-cuerpo"></div></div>`;
    m.hidden = false;
    m.firstElementChild.onclick = onClick;
    m.firstElementChild.onchange = (ev) => { if (ev.target.id === 'as-fecha' && ev.target.value) { ref = ev.target.value; cargar(); } };
    cargar();
  }

  async function cargar() {
    const desde = modo === 'semana' ? lunes(ref) : ref, hasta = modo === 'semana' ? suma(desde, 6) : ref;
    const cobros = await api('GET', `/api/cobros?desde=${desde}&hasta=${hasta}`);
    const dias = modo === 'semana' ? DIAS.map((_, i) => suma(desde, i)) : [ref];
    const acc = (c) => {
      if (c.anulado) return '<span>Anulado</span>';
      if (c.cierre_id) return '<span>Caja cerrada</span>';
      if (c.cliente_id === cli) return '<span class="tag">De esta clienta</span>';
      if (c.cliente_id) return `<span>De ${h(c.clienta)}</span><button class="btn-lnk" data-a="pasar" data-id="${c.id}">Pasar acá</button>`;
      return `<button class="btn-lnk" data-a="asoc" data-id="${c.id}">Asociar</button>`;
    };
    $('#as-cuerpo').innerHTML = `<div class="asoc-barra">
        <button class="chev" data-a="mov" data-d="-1" title="Anterior">‹</button>
        <input type="date" id="as-fecha" value="${ref}">
        <button class="chev" data-a="mov" data-d="1" title="Siguiente">›</button>
        <button class="btn-oro" data-a="hoy">Hoy</button>
        <div class="seg"><button class="${modo === 'dia' ? 'on' : ''}" data-a="modo" data-m="dia">Día</button><button class="${modo === 'semana' ? 'on' : ''}" data-a="modo" data-m="semana">Semana</button></div>
        <span class="nota" style="margin:0">${modo === 'semana' ? `${fdia(desde)} al ${fdia(hasta)}` : fdia(ref)}</span></div>
      <div class="asoc-grid ${modo}">${dias.map((d, i) => {
        const l = cobros.filter((c) => c.fecha.slice(0, 10) === d);
        return `<div class="asoc-dia ${d === ref ? 'sel' : ''}"><h4>${DIAS[(parse(d).getDay() + 6) % 7]} ${fdia(d)}</h4>${l.length ? l.map((c) => `<div class="asoc-cobro ${c.anulado ? 'off' : ''}">
          <div class="ac-top"><span>${c.fecha.slice(11, 16)}</span><span>${peso(c.total)}</span></div>
          <ul>${c.servicios.map((s) => `<li>${h(s.recorrido.replaceAll(' › ', ' · '))}</li>`).join('')}</ul><div class="ac-pie">${acc(c)}</div></div>`).join('') : '<div class="asoc-vacio">Sin turnos</div>'}</div>`;
      }).join('')}</div>
      <div class="explo-pie"><button class="btn-verde" data-a="cerrar">Listo</button></div>`;
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    try {
      if (a === 'cerrar') cerrarCapa(m);
      else if (a === 'hoy') { ref = hoyISO(); await cargar(); }
      else if (a === 'mov') { ref = suma(ref, Number(b.dataset.d) * (modo === 'semana' ? 7 : 1)); await cargar(); }
      else if (a === 'modo') { modo = b.dataset.m; await cargar(); }
      else {
        const poner = async () => {
          try { await api('PATCH', `/api/cobros/${b.dataset.id}`, { cliente_id: cli }); estadoGuardado(true); toast('Turno asociado'); await cargar(); alCambiar?.(); }
          catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
        };
        if (a === 'asoc') await poner(); else if (a === 'pasar') doble(b, '¿Seguro?', poner);
      }
    } catch (e) { toast(e.message, { error: true }); }
  }
  return { abrir };
})();