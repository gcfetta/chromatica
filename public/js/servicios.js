// Pantalla SERVICIOS Y PRECIOS: carta visual por grupo, edición de precios y "actualizar precios %".
const Servicios = (() => {
  const ESTRELLAS = { 'Básico': 1, Plus: 2, Premium: 3 };
  const ORDEN = ['Cortes', 'Mechas', 'Retoques deco', 'Coloraciones', 'Tratamientos'];
  let el, datos = [], filtro = 'Todos', editar = false;
  const A = { abierto: false, pct: '', grupo: 'todos', red: 500, prev: null };

  async function montar(contenedor) {
    el = contenedor; el.onclick = onClick; el.onchange = onChange; el.oninput = null;
    await cargar(); pintar();
  }

  async function cargar() {
    const filas = await api('GET', '/api/servicios'), mapa = new Map();
    for (const f of filas) {
      if (!mapa.has(f.id)) mapa.set(f.id, { id: f.id, nombre: f.nombre, categoria: f.categoria, grupo: f.grupo, subgrupo: f.subgrupo, duracion: f.duracion_texto, variantes: [] });
      mapa.get(f.id).variantes.push(f);
    }
    datos = [...mapa.values()];
  }

  const grupos = () => ORDEN.filter((g) => datos.some((s) => s.grupo === g));

  function tarjeta(s) {
    const niveles = [];
    for (const v of s.variantes) {
      const [a, ...resto] = v.etiqueta.split(' · ');
      const nivel = ESTRELLAS[a] ? a : '';
      const etiq = nivel ? resto.join(' · ') : v.etiqueta;
      let n = niveles.find((x) => x.nivel === nivel); if (!n) niveles.push((n = { nivel, filas: [] }));
      n.filas.push({ v, etiq });
    }
    const fila = ({ v, etiq }) => `<div class="vfila"><span>${v.etiqueta === 'Único' || v.etiqueta === 'Desde' ? (v.precio_desde ? 'Desde' : '') : h(etiq)}</span>
      <span>${editar ? `<input type="number" min="1" data-v="${v.variante_id}" value="${v.precio_tarjeta}">` : `<span class="p">${peso(v.precio_tarjeta)}</span>`}
      ${s.categoria === 'corte' ? '' : `<small>Efectivo ${peso(v.precio_efectivo)}</small>`}</span></div>`;
    return `<div class="srv"><h3>${h(s.nombre)}${s.subgrupo ? `<span class="tagg">${h(s.subgrupo)}</span>` : ''}</h3>${s.duracion ? `<div class="dur">Duración promedio: ${h(s.duracion)}</div>` : ''}
      ${niveles.map((n) => `${n.nivel ? `<div class="nivel">${'★'.repeat(ESTRELLAS[n.nivel])} ${h(n.nivel)}</div>` : ''}${n.filas.map(fila).join('')}`).join('')}</div>`;
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
      <div class="srv-barra">${['Todos', ...grupos()].map((g) => `<button class="chip ${g === filtro ? 'on' : ''}" data-acc="filtro" data-g="${h(g)}">${h(g)}</button>`).join('')}<span class="sp"></span>
        <button class="btn-oro" data-acc="editar">${editar ? 'Terminar edición' : 'Editar precios'}</button><button class="btn-oro" data-acc="abrir-act">Actualizar precios %</button></div>
      ${panelAct()}<p class="nota" style="margin-bottom:12px">${editar ? 'Escribí el precio de lista (tarjeta o cuotas); el de efectivo se calcula solo. Los cortes tienen un único precio.' : 'Precio grande: tarjeta o cuotas. Efectivo y transferencia, con descuento.'}</p>
      <div class="srv-grid">${lista.map(tarjeta).join('')}</div>`;
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    const a = b.dataset.acc;
    try {
      if (a === 'filtro') { filtro = b.dataset.g; pintar(); }
      else if (a === 'editar') { editar = !editar; pintar(); }
      else if (a === 'abrir-act') { A.abierto = !A.abierto; A.prev = null; pintar(); }
      else if (a === 'previa') {
        A.prev = await api('POST', '/api/servicios/actualizar-precios', { porcentaje: Number(A.pct), grupo: A.grupo, redondeo: A.red });
        pintar();
      } else if (a === 'aplicar') doble(b, '¿Seguro? Cambia los precios de la carta', async () => {
        try {
          const r = await api('POST', '/api/servicios/actualizar-precios', { porcentaje: Number(A.pct), grupo: A.grupo, redondeo: A.red, aplicar: true });
          A.abierto = false; A.prev = null; A.pct = ''; await cargar(); pintar(); estadoGuardado(true); toast(`Precios actualizados (${r.cantidad})`);
        } catch (e) { toast(e.message, { error: true }); }
      });
    } catch (e) { toast(e.message, { error: true }); }
  }

  async function onChange(ev) {
    const t = ev.target;
    if (t.dataset.campo) { A[t.dataset.campo] = t.dataset.campo === 'red' ? Number(t.value) : t.value; A.prev = null; return; }
    if (!t.dataset.v) return;
    try {
      const r = await api('PUT', `/api/servicios/variantes/${t.dataset.v}`, { precio: Number(t.value) });
      for (const s of datos) for (const v of s.variantes) if (v.variante_id === Number(t.dataset.v)) { v.precio_tarjeta = r.precio_tarjeta; v.precio_efectivo = r.precio_efectivo; }
      estadoGuardado(true); pintar();
    } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); await cargar(); pintar(); }
  }
  return { montar };
})();