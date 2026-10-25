// Popup para asociar turnos (cobros) del historial a una clienta: calendario + tablero por día (o semana).
const Asociar = (() => {
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DIASL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const suma = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunes = (s) => suma(s, -((parse(s).getDay() + 6) % 7));
  let m, cli, ref, modo, alCambiar;

  function abrir(clienteId, nombre, cb) {
    cli = clienteId; alCambiar = cb; ref = hoyISO(); modo = 'semana';
    m = $('#modal');
    m.innerHTML = `<div class="ancho asoc"><div class="asoc-cab"><h2>Asociar turnos a ${h(nombre)}</h2>
        <div class="asoc-nav"><button class="asoc-chev" data-a="mov" data-d="-1" title="Anterior">‹</button><input type="date" id="as-fecha" value="${ref}"><button class="asoc-chev" data-a="mov" data-d="1" title="Siguiente">›</button></div></div>
      <div id="as-cuerpo"></div></div>`;
    m.hidden = false;
    m.firstElementChild.onclick = onClick;
    m.firstElementChild.onchange = (ev) => { if (ev.target.id === 'as-fecha' && ev.target.value) { ref = ev.target.value; cargar(); } };
    cargar();
  }

  const tarjeta = (c) => {
    const mia = c.cliente_id === cli;
    const serv = c.servicios.map((s) => s.recorrido.replaceAll(' › ', ' · ')).join(' + ');
    let de = '', btn = '';
    if (c.anulado) de = 'Anulado';
    else if (mia) { de = '✓ De esta clienta'; btn = `<button class="ac-btn" data-a="quitar" data-id="${c.id}">Quitar</button>`; }
    else if (c.cliente_id) { de = `De ${h(c.clienta)}`; btn = `<button class="ac-btn" data-a="pasar" data-id="${c.id}">Pasar acá</button>`; }
    else btn = `<button class="ac-btn pri" data-a="asoc" data-id="${c.id}">Asociar</button>`;
    return `<div class="asoc-cobro ${mia ? 'mia' : ''} ${c.anulado ? 'off' : ''}"><div class="ac-top"><b>${c.fecha.slice(11, 16)}</b><span class="ac-monto">${peso(c.total)}</span></div>
      <div class="ac-serv" title="${h(serv)}">${h(serv)}</div>${de ? `<div class="ac-de">${de}</div>` : ''}${btn ? `<div class="ac-pie">${btn}</div>` : ''}</div>`;
  };

  async function cargar() {
    $('#as-fecha').value = ref;
    const desde = modo === 'semana' ? lunes(ref) : ref, hasta = modo === 'semana' ? suma(desde, 6) : ref;
    const cobros = await api('GET', `/api/cobros?desde=${desde}&hasta=${hasta}`);
    const dias = modo === 'semana' ? DIAS.map((_, i) => suma(desde, i)) : [ref];
    const hoy = hoyISO(), total = cobros.filter((c) => !c.anulado).length;
    $('#as-cuerpo').innerHTML = `<div class="asoc-sub">
        <button class="btn-oro" data-a="hoy">Hoy</button>
        <div class="seg"><button class="${modo === 'dia' ? 'on' : ''}" data-a="modo" data-m="dia">Día</button><button class="${modo === 'semana' ? 'on' : ''}" data-a="modo" data-m="semana">Semana</button></div>
        <span class="rango">${modo === 'semana' ? `${fdia(desde)} al ${fdia(hasta)}` : `${DIASL[(parse(ref).getDay() + 6) % 7]} ${fdia(ref)}`} · ${total} ${total === 1 ? 'turno' : 'turnos'}</span></div>
      <div class="asoc-grid ${modo}" ${modo === 'semana' ? `style="grid-template-columns:${dias.map((d) => (cobros.filter((c) => c.fecha.slice(0, 10) === d).length > 3 ? 'minmax(300px,2.4fr)' : 'minmax(130px,1fr)')).join(' ')}"` : ''}>${dias.map((d) => {
        const l = cobros.filter((c) => c.fecha.slice(0, 10) === d), i = (parse(d).getDay() + 6) % 7;
        return `<div class="asoc-dia ${d === ref ? 'sel' : ''} ${d === hoy ? 'hoy' : ''}">
          <button class="asoc-dh" data-a="ver-dia" data-d="${d}" ${modo === 'dia' ? 'disabled' : ''}><small>${DIAS[i]}</small><b>${d.slice(8, 10)}</b><i>${l.length ? l.length : ''}</i></button>
          <div class="asoc-lista ${l.length > 3 && modo === 'semana' ? 'dos' : ''}">${l.length ? l.map(tarjeta).join('') : '<div class="asoc-vacio">Sin turnos</div>'}</div></div>`;
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
      else if (a === 'ver-dia') { ref = b.dataset.d; modo = 'dia'; await cargar(); }
      else {
        const poner = async () => {
          try {
            await api('PATCH', `/api/cobros/${b.dataset.id}`, { cliente_id: a === 'quitar' ? null : cli });
            estadoGuardado(true); toast(a === 'quitar' ? 'Turno desasociado' : 'Turno asociado'); await cargar(); alCambiar?.();
          } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
        };
        if (a === 'pasar') doble(b, '¿Seguro?', poner); else await poner();
      }
    } catch (e) { toast(e.message, { error: true }); }
  }
  return { abrir };
})();