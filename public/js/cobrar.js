// Pantalla COBRAR: selector progresivo a la izquierda, resumen en vivo a la derecha.
// Todos los números del resumen vienen del servidor (/api/cobros/calcular): una sola fuente de cálculo.
const Cobrar = (() => {
  let K = null;            // catálogo, configuración y empleados
  let S = nuevo();         // estado del cobro en curso
  let el = null;

  const SUBTIT = { 'Mechas': 'Babylights, foilayage, split y más', 'Retoques deco': 'Crecimientos y color después de la deco', 'Coloraciones': 'Raíces, baño de luz, color global' };

  function nuevo() {
    return { servicios: [], ruta: [], metodo: 'efectivo', cuotas: null, sena: true, senaMonto: K?.config.sena_default ?? 10000,
      cliente: null, ficha: '', notas: '', fecha: '', calc: null, editLinea: null, error: '', guardando: false,
      b: { emp: null, horas: '', precio: '', editar: false, desc: '', monto: '', aplicarDesc: true } };
  }
  const bVacio = () => ({ emp: null, horas: '', precio: '', editar: false, desc: '', monto: '', aplicarDesc: true });

  // ---------- datos ----------
  async function cargar() {
    const [filas, config, empleados] = await Promise.all([api('GET', '/api/servicios'), api('GET', '/api/config'), api('GET', '/api/empleados')]);
    const mapa = new Map();
    for (const r of filas) {
      if (!mapa.has(r.id)) mapa.set(r.id, { id: r.id, nombre: r.nombre, categoria: r.categoria, grupo: r.grupo, subgrupo: r.subgrupo, dur: r.duracion_texto, variantes: [] });
      mapa.get(r.id).variantes.push({ id: r.variante_id, etiqueta: r.etiqueta, partes: r.etiqueta.split(' · '), tarjeta: r.precio_tarjeta, efectivo: r.precio_efectivo, desde: !!r.precio_desde });
    }
    K = { servicios: [...mapa.values()], config, empleados: empleados.filter((e) => e.activo) };
  }

  const precioDe = (v, cat) => (S.metodo === 'efectivo' && cat !== 'corte' ? v.efectivo : v.tarjeta);
  const modoDe = (empId, cat) => K.empleados.find((e) => String(e.id) === String(empId))?.pagos[cat]?.modo;
  const empDefault = (cat) => {
    if (cat !== 'corte') return '';
    const d = K.config.empleado_corte;
    if (d && K.empleados.some((e) => e.id === d)) return String(d);
    return K.empleados.length === 1 ? String(K.empleados[0].id) : '';
  };

  // ---------- navegación del selector ----------
  function opServicio(s) {
    const unico = s.variantes.length === 1;
    return { clave: String(s.id), t: s.nombre, s: s.dur ? `Duración promedio: ${s.dur}` : '', precio: unico ? precioDe(s.variantes[0], s.categoria) : null };
  }

  function hojaDe(s, resto) {
    const vs = s.variantes.filter((v) => resto.every((p, i) => v.partes[i] === p));
    if (vs.length === 1) return { tipo: 'hoja', s, v: vs[0] };
    const sig = [...new Set(vs.map((v) => v.partes[resto.length]).filter((x) => x !== undefined))];
    const niveles = sig.every((x) => (K.config.niveles || []).includes(x));
    return { tipo: 'opciones', titulo: niveles ? 'Elegí el nivel' : 'Elegí el largo o talle', ops: sig.map((x) => ({ clave: x, t: x })) };
  }

  function resolver() {
    const r = S.ruta.map((x) => x.clave);
    if (!r.length) return { tipo: 'opciones', titulo: '¿Qué querés cobrar?', ops: [
      { clave: 'corte', t: 'Corte', s: 'Precios fijos' }, { clave: 'color', t: 'Color', s: 'Técnicas, retoques y coloraciones' },
      { clave: 'nutri', t: 'Nutri', s: 'Rituales y tratamientos' }, { clave: 'otro', t: 'Otro', s: 'Monto libre' }] };
    const cat = r[0];
    if (cat === 'otro') return { tipo: 'otro' };
    const delCat = K.servicios.filter((s) => s.categoria === cat);
    if (cat === 'corte') {
      if (r.length === 1) return { tipo: 'opciones', titulo: '¿Corto o largo?', ops: [...new Set(delCat.map((s) => s.subgrupo))].map((g) => ({ clave: g, t: 'Corte ' + g.toLowerCase(), s: g === 'Corto' ? 'Barbería, clásicos y diseño' : 'Cabello largo, desde bob' })) };
      const lista = delCat.filter((s) => s.subgrupo === r[1]);
      if (r.length === 2) return { tipo: 'opciones', titulo: 'Corte ' + r[1].toLowerCase(), nota: r[1] === 'Largo' ? 'Si el cambio es extremo de largo a corto, se cobra como corte largo.' : '', ops: lista.map(opServicio) };
      return hojaDe(lista.find((s) => s.id === Number(r[2])), r.slice(3));
    }
    let lista = delCat, desde = 1;
    if (cat === 'color') {
      if (r.length === 1) return { tipo: 'opciones', titulo: '¿Qué tipo de color?', ops: [...new Set(delCat.map((s) => s.grupo))].map((g) => ({ clave: g, t: g, s: SUBTIT[g] || '' })) };
      lista = delCat.filter((s) => s.grupo === r[1]); desde = 2;
    }
    if (r.length === desde) return { tipo: 'opciones', titulo: cat === 'color' ? r[1] : 'Tratamientos', ops: lista.map(opServicio) };
    return hojaDe(lista.find((s) => s.id === Number(r[desde])), r.slice(desde + 1));
  }

  // ---------- render ----------
  function render() { renderIzq(); renderDer(); }

  function renderIzq() {
    const paso = resolver();
    
    // Migas de pan formateadas exactamente como en la maqueta
    const migas = S.ruta.length
      ? S.ruta.map((m, i) => `<button data-acc="miga" data-i="${i}">${h(m.label)}</button>`).join(' <span class="sep">›</span> ') + 
        ` <button data-acc="reiniciar">Empezar de nuevo</button>`
      : 'Elegí el primer paso';
      
    let cuerpo = '';
    if (paso.tipo === 'opciones') {
      cuerpo = `<div class="paso"><h3>${h(paso.titulo)}</h3>${paso.nota ? `<p class="nota">${h(paso.nota)}</p>` : ''}<div class="opciones">${paso.ops.map((o) =>
        `<button class="op" data-acc="elegir" data-clave="${h(o.clave)}" data-label="${h(o.t)}"><b>${h(o.t)}</b>${o.precio != null ? `<span class="pr">${peso(o.precio)}</span>` : ''}${o.s ? `<small>${h(o.s)}</small>` : ''}</button>`).join('')}</div></div>`;
    } else if (paso.tipo === 'hoja') cuerpo = hojaHTML(paso);
    else cuerpo = otroHTML();

    // Encabezado izquierdo con Título y Migas dentro del contenedor de la izquierda
    el.querySelector('#izq').innerHTML = `
      <div class="cobrar-izq-cab">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div class="eyebrow">Nuevo cobro</div>
          <div class="migas-top-bar">${migas}</div>
        </div>
        <h1 style="margin:0;">Armá el servicio</h1>
      </div>
      <div class="hoja-contenedor-cards">${cuerpo}</div>`;
  }

  function selEmpleado(cat, valor, campo) {
    const val = valor === null ? empDefault(cat) : valor;
    return `<select data-campo="${campo}"><option value="">Sin asignar</option>${K.empleados.map((e) => `<option value="${e.id}" ${String(e.id) === String(val) ? 'selected' : ''}>${h(e.nombre)}</option>`).join('')}</select>`;
  }

  function horasHTML(cat) {
    const emp = S.b.emp === null ? empDefault(cat) : S.b.emp;
    if (!emp || modoDe(emp, cat) !== 'hora') return '';
    return `<label class="cam">Horas reales (opcional, podés cargarlas después)</label><input type="number" step="0.25" min="0" data-campo="b.horas" value="${h(S.b.horas)}" placeholder="Ej: 3.5">`;
  }

  function hojaHTML({ s, v }) {
    const cat = s.categoria;
    const recorrido = [s.nombre, ['Único', 'Desde'].includes(v.etiqueta) ? null : v.etiqueta].filter(Boolean).join(' · ');
    const lista = v.tarjeta, ef = v.efectivo;
    const dto = S.metodo === 'efectivo' && cat !== 'corte' && ef < lista ? `<small class="nota">Lista ${peso(lista)} · descuento efectivo/transferencia</small>` : '';
    const editar = S.b.editar || v.desde;
    return `<div class="hoja"><div class="eyebrow">Último paso</div><h3>${h(recorrido)}</h3>
      <div class="precio">${peso(precioDe(v, cat))}</div>${dto}
      ${s.dur ? `<div class="chip">Duración promedio: ${h(s.dur)}</div>` : ''}
      <label class="cam">Profesional</label>${selEmpleado(cat, S.b.emp, 'b.emp')}
      ${horasHTML(cat)}
      ${editar ? `<label class="cam">${v.desde ? 'Precio (desde — ajustalo)' : 'Precio final'}</label><input type="number" min="0" data-campo="b.precio" value="${h(S.b.precio || (v.desde ? precioDe(v, cat) : ''))}">`
        : `<div style="margin-top:10px"><button class="btn-lnk" data-acc="editar-precio">Cambiar precio</button></div>`}
      <div style="margin-top:16px"><button class="btn-verde" data-acc="sumar" data-v="${v.id}" data-cat="${cat}" data-desde="${v.desde ? 1 : 0}" data-pre="${precioDe(v, cat)}">Sumar al cobro</button></div></div>`;
  }

  function otroHTML() {
    return `<div class="hoja"><div class="eyebrow">Otro servicio</div><h3>Monto libre</h3>
      <label class="cam">Descripción</label><input type="text" data-campo="b.desc" value="${h(S.b.desc)}" placeholder="Ej: Peinado">
      <label class="cam">Monto (precio de lista)</label><input type="number" min="0" data-campo="b.monto" value="${h(S.b.monto)}">
      <label style="display:block;margin-top:10px;font-size:12px"><input type="checkbox" data-campo="b.aplicarDesc" ${S.b.aplicarDesc ? 'checked' : ''}> Aplicar descuento por efectivo/transferencia</label>
      <label class="cam">Profesional</label>${selEmpleado('otro', S.b.emp, 'b.emp')}
      ${horasHTML('otro')}
      <div style="margin-top:16px"><button class="btn-verde" data-acc="sumar-otro">Sumar al cobro</button></div></div>`;
  }

  function renderDer() {
    const c = S.calc;
    const dto = (c?.servicios || []).filter((x) => !x.editado).reduce((a, x) => a + Math.max(0, x.descuento), 0);
    const opciones = K.config.cuotas_opciones;
    const optsEmp = (sel) => `<option value="">Sin asignar</option>${K.empleados.map((e) => `<option value="${e.id}" ${String(e.id) === String(sel ?? '') ? 'selected' : ''}>${h(e.nombre)}</option>`).join('')}`;
    const nomEmp = (id) => K.empleados.find((e) => String(e.id) === String(id))?.nombre || 'Sin asignar';
    
    const lineas = S.servicios.length ? S.servicios.map((l, i) => {
      const x = c?.servicios?.[i];
      const nombre = x?.recorrido || l.descripcion || 'Servicio';
      const pideHoras = x?.pago_modo === 'hora';
      const extra = !x ? '' : pideHoras
        ? (l.horas == null ? 'Faltan cargar las horas' : `${l.horas} hs`)
        : `Comisión ${peso(x.pago_monto)}`;
      return `<div class="linea">
        <div class="t"><b>${h(nombre)}</b><span class="p">${peso(x ? x.precio_cobrado : 0)}</span></div>
        <small>${h(nomEmp(x ? x.empleado_id : l.empleado_id))}${extra ? ` · <span class="com">${h(extra)}</span>` : ''}${x?.editado ? ` · <span class="ed">precio editado</span>` : ''}</small>
        <div class="mini" ${pideHoras ? '' : 'style="grid-template-columns:1fr"'}><select data-campo="l.${i}.emp">${optsEmp(x ? x.empleado_id : l.empleado_id)}</select>
          ${pideHoras ? `<input type="number" step="0.25" min="0" data-campo="l.${i}.horas" value="${l.horas ?? ''}" placeholder="hs">` : ''}</div>
        ${S.editLinea === i ? `<div class="mini"><input type="number" min="0" data-campo="l.${i}.precio" value="${x ? x.precio_cobrado : ''}"><button class="btn-lnk" data-acc="precio-ok" data-i="${i}">OK</button></div>` : ''}
        <div class="acc"><button class="btn-lnk" data-acc="precio-linea" data-i="${i}">Editar precio</button><button class="btn-lnk" data-acc="quitar" data-i="${i}">Quitar</button></div></div>`;
    }).join('') : `<div class="vacio">Todavía no hay servicios sumados.</div>`;

    const scroll = el.querySelector('#der .res-top')?.scrollTop || 0;
    
    el.querySelector('#der').innerHTML = `
      <div class="res-top">
        <div class="res-cab">
          <h2>Resumen del cobro</h2>
          <div style="display:flex; gap:8px; align-items:center;">
            ${S.servicios.length ? `<button class="btn-lnk" data-acc="limpiar-ticket" style="font-size:11px; color:var(--cor);">Limpiar ticket</button>` : ''}
            <span class="badge">${S.servicios.length ? 'En preparación' : 'Nuevo'}</span>
          </div>
        </div>
        
        <div class="fila-fecha-clienta">
          <label class="fechachica">Fecha del cobro <input type="date" data-campo="fecha" value="${S.fecha || hoyISO()}" max="${hoyISO()}"></label>
          <div>
            <label class="fechachica" style="margin-bottom:4px;">Clienta</label>
            <div class="clienta-compacta">
              <span>${S.cliente ? `<b>${h(S.cliente.nombre)}</b>` : 'Sin clienta'}</span>
              <button class="mas" data-acc="clienta" title="Asociar clienta">＋</button>
            </div>
          </div>
        </div>

        <div class="metodos"><button class="met ${S.metodo === 'efectivo' ? 'on' : ''}" data-acc="metodo" data-m="efectivo">Efectivo / transf.</button>
          <button class="met ${S.metodo === 'tarjeta' ? 'on' : ''}" data-acc="metodo" data-m="tarjeta">Cuotas</button></div>
        ${S.metodo === 'tarjeta' ? `<select data-campo="cuotas" style="margin-bottom:6px;">${opciones.map((n) => `<option value="${n}" ${n === S.cuotas ? 'selected' : ''}>${n === 1 ? '1 cuota' : n + ' cuotas sin interés'}</option>`).join('')}</select>` : ''}
        
        <div class="sena"><label><input type="checkbox" data-campo="sena" ${S.sena ? 'checked' : ''}> Tenía seña</label>
          <input type="number" min="0" data-campo="senaMonto" value="${S.senaMonto}" ${S.sena ? '' : 'disabled'}></div>
        
        ${S.error ? `<div class="err">${h(S.error)}</div>` : ''}
        ${c?.horas_pendientes ? `<div class="aviso">Faltan cargar las horas de ${c.horas_pendientes} servicio(s).</div>` : ''}
        
        <div class="tot">
          <div><span>Total servicios bruta</span><span>${peso(c?.total ? c.total + dto + (c?.sena || 0) : 0)}</span></div>
          ${dto > 0 ? `<div class="dto-row"><span class="dto-lbl">Descuento efectivo ${K.config.descuento_efectivo_pct}%</span><span>- ${peso(dto)}</span></div>` : ''}
          ${(c?.sena || 0) > 0 ? `<div class="sena-row"><span class="sena-lbl">Seña descontada</span><span>- ${peso(c.sena)}</span></div>` : ''}
        </div>
        
        <div class="saldo"><span>Saldo a cobrar</span><b>${peso(c?.saldo)}</b></div>
        <button class="btn-verde" data-acc="guardar" ${S.servicios.length && !S.guardando && !S.error ? '' : 'disabled'}>Cobrar y guardar</button>
      </div>
      
      <div class="res-serv">Servicios del cobro ${S.servicios.length ? `(${S.servicios.length})` : ''}</div>
      <div class="lineas">${lineas}</div>`;
      
    const rt = el.querySelector('#der .res-top'); if (rt) rt.scrollTop = scroll;
  }

  // ---------- cálculo en el servidor ----------
  function payload() {
    return { metodo_cobro: S.metodo, cuotas: S.metodo === 'tarjeta' ? S.cuotas : undefined, sena: S.sena ? Number(S.senaMonto) || 0 : 0, servicios: S.servicios };
  }
  async function calcular() {
    try {
      S.calc = await api('POST', '/api/cobros/calcular', payload());
      S.error = '';
    } catch (e) { if (e.status !== 401) S.error = e.message; }
    renderIzq(); renderDer();
  }

  // ---------- acciones ----------
  const acciones = {
    elegir: (d) => { S.ruta.push({ clave: d.clave, label: d.label }); S.b = bVacio(); renderIzq(); },
    miga: (d) => { S.ruta = S.ruta.slice(0, Number(d.i) + 1); S.b = bVacio(); renderIzq(); },
    reiniciar: () => { S.ruta = []; S.b = bVacio(); renderIzq(); },
    'limpiar-ticket': () => { S.servicios = []; S.ruta = []; S.b = bVacio(); calcular(); },
    'editar-precio': () => { S.b.editar = true; renderIzq(); },
    sumar: (d) => {
      const emp = S.b.emp === null ? empDefault(d.cat) : S.b.emp;
      const l = { variante_id: Number(d.v), empleado_id: emp === '' ? null : Number(emp) };
      if (S.b.horas !== '') l.horas = Number(S.b.horas);
      if (S.b.precio !== '' && (S.b.editar || d.desde === '1')) l.precio_cobrado = Number(S.b.precio);
      S.servicios.push(l); S.ruta = []; S.b = bVacio(); calcular();
    },
    'sumar-otro': () => {
      if (!S.b.desc.trim() || !(Number(S.b.monto) > 0)) return toast('Completá la descripción y el monto', { error: true });
      const emp = S.b.emp === null ? '' : S.b.emp;
      const l = { categoria: 'otro', descripcion: S.b.desc.trim(), monto: Number(S.b.monto), aplicar_descuento: S.b.aplicarDesc, empleado_id: emp === '' ? null : Number(emp) };
      if (S.b.horas !== '') l.horas = Number(S.b.horas);
      S.servicios.push(l); S.ruta = []; S.b = bVacio(); calcular();
    },
    quitar: (d) => { S.servicios.splice(Number(d.i), 1); S.editLinea = null; calcular(); },
    'precio-linea': (d) => { S.editLinea = Number(d.i); renderDer(); el.querySelector(`[data-campo="l.${d.i}.precio"]`)?.focus(); },
    'precio-ok': (d) => {
      const inp = el.querySelector(`[data-campo="l.${d.i}.precio"]`);
      aplicarPrecio(Number(d.i), inp ? inp.value : '');
    },
    metodo: (d) => { S.metodo = d.m; S.cuotas = d.m === 'tarjeta' ? (S.cuotas ?? K.config.cuotas_opciones.at(-1)) : null; renderIzq(); calcular(); },
    clienta: () => abrirClienta(),
    guardar: async () => {
      S.guardando = true; renderDer();
      try {
        const body = { ...payload(), cliente_id: S.cliente?.id ?? null, ficha: S.ficha || null, notas: S.notas || null };
        if (S.fecha && S.fecha !== hoyISO()) body.fecha = `${S.fecha} 12:00`;
        const d = await api('POST', '/api/cobros', body);
        estadoGuardado(true);
        S = nuevo();
        await calcular(); render();
        toast(`Cobro guardado · ${peso(d.total)}`, { accion: 'Ver detalle', onAccion: () => Detalle.abrir(d.id) });
      } catch (e) {
        S.guardando = false; estadoGuardado(false); toast(e.message, { error: true }); renderDer();
      }
    },
  };

  function aplicarPrecio(i, val) {
    const l = S.servicios[i]; S.editLinea = null;
    if (val === '' || isNaN(Number(val))) delete l.precio_cobrado; else l.precio_cobrado = Number(val);
    calcular();
  }

  function onClick(ev) {
    const b = ev.target.closest('[data-acc]');
    if (b && acciones[b.dataset.acc]) acciones[b.dataset.acc](b.dataset);
  }

  function onChange(ev) {
    const t = ev.target, campo = t.dataset.campo;
    if (!campo) return;
    const val = t.type === 'checkbox' ? t.checked : t.value;
    if (campo.startsWith('b.')) {
      const k = campo.slice(2); S.b[k] = k === 'aplicarDesc' ? val : val;
      if (k === 'emp') renderIzq();
    } else if (campo.startsWith('l.')) {
      const [, i, k] = campo.split('.'); const l = S.servicios[Number(i)];
      if (k === 'precio') return aplicarPrecio(Number(i), val);
      if (k === 'emp') l.empleado_id = val === '' ? null : Number(val);
      if (k === 'horas') { if (val === '') delete l.horas; else l.horas = Number(val); }
      calcular();
    } else if (campo === 'cuotas') { S.cuotas = Number(val); calcular(); }
    else if (campo === 'sena') { S.sena = val; calcular(); }
    else if (campo === 'senaMonto') { S.senaMonto = Number(val) || 0; calcular(); }
    else if (campo === 'fecha') { S.fecha = val; renderDer(); }
  }

  function onInput(ev) {
    const campo = ev.target.dataset.campo;
    if (campo === 'b.desc' || campo === 'b.monto' || campo === 'b.horas' || campo === 'b.precio') S.b[campo.slice(2)] = ev.target.value;
  }

  // ---------- clienta y ficha ----------
  function abrirClienta() {
    const d = $('#drawer');
    d.innerHTML = `<div><h2 style="font-size:26px">Clienta y ficha</h2><p class="nota">Es opcional: se puede cobrar sin clienta. Una clienta nueva se crea recién al tocar «Listo».</p>
      <label class="cam">Clienta</label><div id="cl-combo"></div>
      <div id="cl-contacto" hidden><label class="cam">Contacto de la nueva clienta (opcional)</label><input type="text" id="cl-cont" placeholder="Teléfono, Instagram…" value="${h(S.cliente?.contacto || '')}"></div>
      <label class="cam">Ficha de este turno (opcional)</label><textarea id="cl-ficha" rows="4">${h(S.ficha)}</textarea>
      <label class="cam">Notas (opcional)</label><textarea id="cl-notas" rows="2">${h(S.notas)}</textarea>
      <div style="margin-top:16px"><button class="btn-verde" id="cl-ok">Listo</button></div></div>`;
    const mostrar = (c) => { $('#cl-contacto', d).hidden = !c?.nuevo; };
    selectorClienta($('#cl-combo', d), { valor: S.cliente, diferir: true, onCambio: (c) => { S.cliente = c; mostrar(c); } });
    mostrar(S.cliente);
    
    d.alCerrar = () => { S.ficha = $('#cl-ficha', d).value.trim(); S.notas = $('#cl-notas', d).value.trim(); if (S.cliente?.nuevo) S.cliente = null; renderDer(); };
    $('#cl-ok', d).onclick = async () => {
      try {
        if (S.cliente?.nuevo) {
          const c = await api('POST', '/api/clientes', { nombre: S.cliente.nombre, contacto: $('#cl-cont', d).value.trim() || null });
          S.cliente = { id: c.id, nombre: c.nombre };
        }
        cerrarCapa(d);
      } catch (e) { toast(e.message, { error: true }); }
    };
    d.hidden = false;
  }

  // ---------- montaje ----------
  async function montar(contenedor) {
    el = contenedor;
    await cargar();
    // Se elimina el contenedor superior #cab para permitir que las dos columnas del grid compartan la misma altura inicial
    el.innerHTML = `<div class="cobrar"><div id="izq" class="cobrar-izq"></div><div class="panel der" id="der"></div></div>`;
    el.onclick = onClick; el.onchange = onChange; el.oninput = onInput;
    await calcular(); render();
  }

  return { montar };
})();