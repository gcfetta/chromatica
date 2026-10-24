// Pantalla COPIAS DE SEGURIDAD: copia manual, carpeta de la nube (con explorador), restauración y lista paginada con filtro.
const Copias = (() => {
  const MOT = { auto: 'Automática', manual: 'Manual', cierre: 'Al cerrar la caja', 'pre-restauracion': 'Antes de restaurar' };
  const FILTROS = [['importantes', 'Manuales y cierre de caja'], ['todas', 'Todas'], ['auto', 'Automáticas']];
  let el, filtro = 'importantes', pagina = 1, archivo = null, rutaEx = '';
  const fecha = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
  const tam = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const chev = (izq) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${izq ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}"/></svg>`;
  const carpetaIcono = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

  async function montar(c) {
    el = c; el.onclick = onClick; el.onchange = onChange; el.oninput = null;
    filtro = 'importantes'; pagina = 1; archivo = null;
    await pintar();
  }

  function pintarArchivo() {
    $('#rest-arch', el).innerHTML = archivo
      ? `<span class="arch-nombre">${h(archivo.name)} · ${tam(archivo.size)}</span><button class="btn-verde" data-acc="restaurar-archivo">Restaurar desde este archivo</button>`
      : '<span class="nota" style="margin:0">Ningún archivo elegido.</span>';
  }

  async function pintar() {
    const d = await api('GET', `/api/copias?filtro=${filtro}&pagina=${pagina}`);
    pagina = d.pagina;
    const ult = d.ultima;
    const estadoSync = !d.carpeta_sync ? 'Sin carpeta de la nube: las copias quedan solo en esta computadora.'
      : d.sync_ok ? 'Cada copia nueva también se guarda en esta carpeta.' : 'No se puede escribir en esa carpeta. Revisá que exista y que Drive esté abierto.';
    const desde = d.total ? (d.pagina - 1) * 10 + 1 : 0, hasta = Math.min(d.pagina * 10, d.total);
    el.innerHTML = `<h1>Copias de seguridad</h1>
      <div class="copias-grid">
        <div class="panel"><div class="eyebrow">Última copia</div><div class="grande">${ult ? fecha(ult.fecha) : 'Todavía no hay'}</div>
          <p class="nota">${ult ? MOT[ult.motivo] + ' · ' : ''}Guardadas en esta computadora: ${h(d.carpeta_local)}</p>
          <button class="btn-verde" data-acc="copiar">Hacer copia ahora</button>
          <p class="nota" style="margin:10px 0 0">Automática: una por día. También se hace una al cerrar la caja. No se borra ninguna.</p></div>
        <div class="panel"><div class="eyebrow">Copia en la nube (Google Drive / iCloud)</div>
          <div class="ruta-sync">${d.carpeta_sync ? h(d.carpeta_sync) : 'Ninguna carpeta elegida'}</div>
          <p class="nota ${d.carpeta_sync && !d.sync_ok ? 'mal' : ''}">${h(estadoSync)}</p>
          <div class="fila-sync"><button class="btn-oro" data-acc="elegir-carpeta">${d.carpeta_sync ? 'Cambiar carpeta' : 'Elegir carpeta'}</button>
            ${d.carpeta_sync ? '<button class="btn-lnk" data-acc="quitar-carpeta">Quitar</button>' : ''}</div>
          <p class="nota" style="margin-top:10px">Elegí una carpeta dentro de Google Drive para escritorio: Drive se encarga de subirla a la nube.</p></div>
      </div>
      <div class="panel exp"><div class="eyebrow">Restaurar desde un archivo de la computadora</div>
        <p class="nota" style="margin-top:8px">Para una copia que esté en una carpeta, un pendrive o descargada de Drive. Reemplaza los datos actuales (antes se guarda una copia del estado de ahora).</p>
        <div class="fila-arch"><button class="btn-oro" data-acc="buscar-archivo">Buscar archivo…</button><input type="file" id="cp-file" accept=".db,.sqlite" hidden><div id="rest-arch"></div></div></div>
      <div class="panel exp"><div class="eyebrow">Exportar para leer en Excel</div>
        <div class="exportar"><a href="/api/copias/exportar/cobros">Cobros (CSV)</a><a href="/api/copias/exportar/clientas">Clientas (CSV)</a><a href="/api/copias/exportar/movimientos">Movimientos (CSV)</a><a href="/api/copias/exportar/auditoria">Historial de cambios (CSV)</a></div></div>
      <div class="panel"><div class="cab-lista"><div class="eyebrow">Copias guardadas</div>
          <div class="seg">${FILTROS.map(([k, t]) => `<button class="${k === d.filtro ? 'on' : ''}" data-acc="filtro" data-f="${k}">${t} <small>${d.conteo[k]}</small></button>`).join('')}</div></div>
        ${d.copias.length ? `<table class="tabla"><tr><th>Fecha</th><th>Tipo</th><th class="r">Tamaño</th><th></th></tr>${d.copias.map((c, i) => `<tr><td>${fecha(c.fecha)}${i === 0 && d.pagina === 1 && d.filtro === 'todas' ? '<span class="nuevo">Más reciente</span>' : ''}</td><td><span class="tag m-${c.motivo}">${MOT[c.motivo]}</span></td><td class="r">${tam(c.tam)}</td>
          <td class="r"><button class="btn-lnk" data-acc="restaurar" data-n="${h(c.nombre)}">Restaurar</button></td></tr>`).join('')}</table>
        <div class="pager-cp"><span class="nota" style="margin:0">${desde}–${hasta} de ${d.total}</span>
          <button class="pag-btn" data-acc="pag" data-d="-1" ${d.pagina <= 1 ? 'disabled' : ''} title="Más recientes">${chev(true)}</button>
          <span class="pag-n">Página ${d.pagina} de ${d.paginas}</span>
          <button class="pag-btn" data-acc="pag" data-d="1" ${d.pagina >= d.paginas ? 'disabled' : ''} title="Más antiguas">${chev(false)}</button></div>
        <p class="nota">Al restaurar, antes se guarda una copia del estado actual (tipo "Antes de restaurar"; la ves en "Todas").</p>` : '<p class="nota" style="margin-top:12px">No hay copias en esta vista.</p>'}</div>`;
    pintarArchivo();
  }

  // ---- explorador de carpetas ----
  async function explorar(ruta) {
    const e = await api('GET', '/api/copias/explorar' + (ruta ? '?ruta=' + encodeURIComponent(ruta) : ''));
    rutaEx = e.ruta;
    $('#ex').innerHTML = `<div class="explo-atajos">${e.atajos.map((a) => `<button class="btn-oro" data-acc="ir" data-r="${h(a.ruta)}">${h(a.nombre)}</button>`).join('')}</div>
      <div class="explo-ruta">${e.padre ? `<button class="btn-lnk" data-acc="ir" data-r="${h(e.padre)}">↑ Subir</button>` : ''}<span>${h(e.ruta)}</span></div>
      <div class="mod-tabla explo-lista">${e.carpetas.length ? e.carpetas.map((c) => `<button data-acc="ir" data-r="${h(c.ruta)}">${carpetaIcono}${h(c.nombre)}</button>`).join('') : '<p class="nota" style="padding:10px">No hay carpetas acá adentro.</p>'}</div>
      <div class="fila-sync"><input type="text" id="ex-nueva" placeholder="Nombre de carpeta nueva (opcional)"><button class="btn-oro" data-acc="ex-crear">Crear acá</button></div>
      <div class="explo-pie"><button class="btn-lnk" data-acc="ex-cancel">Cancelar</button><button class="btn-verde" data-acc="ex-usar">Usar esta carpeta</button></div>`;
  }

  async function abrirExplorador() {
    const m = $('#modal');
    m.innerHTML = '<div class="ancho"><h2>Elegí la carpeta de la nube</h2><p class="nota">Entrá a la carpeta que sincroniza Google Drive (o iCloud) y tocá "Usar esta carpeta".</p><div id="ex"></div></div>';
    m.hidden = false;
    m.firstElementChild.onclick = onExplorador;
    await explorar(el.querySelector('.ruta-sync')?.dataset.r || '');
  }

  async function onExplorador(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    try {
      const a = b.dataset.acc;
      if (a === 'ir') await explorar(b.dataset.r);
      else if (a === 'ex-cancel') cerrarCapa($('#modal'));
      else if (a === 'ex-crear') {
        const n = $('#ex-nueva').value.trim(); if (!n) return toast('Escribí el nombre de la carpeta', { error: true });
        const r = await api('POST', '/api/copias/carpeta-nueva', { ruta: rutaEx, nombre: n }); await explorar(r.ruta);
      } else if (a === 'ex-usar') {
        const r = await api('PUT', '/api/copias/config', { carpeta: rutaEx });
        cerrarCapa($('#modal')); toast(r.copiadas ? `Carpeta guardada · se copiaron ${r.copiadas} copias que faltaban` : 'Carpeta guardada'); await pintar();
      }
    } catch (e) { toast(e.message, { error: true }); }
  }

  function onChange(ev) {
    if (ev.target.id === 'cp-file') { archivo = ev.target.files[0] || null; pintarArchivo(); }
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    try {
      const a = b.dataset.acc;
      if (a === 'copiar') { const r = await api('POST', '/api/copias'); estadoGuardado(true); toast(r.sync === false ? 'Copia hecha, pero no se pudo copiar a la carpeta de la nube' : 'Copia hecha', { error: r.sync === false }); await pintar(); }
      else if (a === 'elegir-carpeta') await abrirExplorador();
      else if (a === 'quitar-carpeta') { await api('PUT', '/api/copias/config', { carpeta: '' }); toast('Carpeta de la nube quitada'); await pintar(); }
      else if (a === 'filtro') { filtro = b.dataset.f; pagina = 1; await pintar(); }
      else if (a === 'pag') { pagina += Number(b.dataset.d); await pintar(); }
      else if (a === 'buscar-archivo') $('#cp-file', el).click();
      else if (a === 'restaurar') doble(b, '¿Seguro? Reemplaza los datos actuales', async () => {
        try { await api('POST', `/api/copias/${encodeURIComponent(b.dataset.n)}/restaurar`); toast('Copia restaurada'); setTimeout(() => location.reload(), 900); }
        catch (e) { toast(e.message, { error: true }); }
      });
      else if (a === 'restaurar-archivo') doble(b, '¿Seguro? Reemplaza los datos actuales', async () => {
        try {
          const r = await fetch('/api/copias/restaurar-archivo', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: archivo });
          const d = await r.json().catch(() => null);
          if (!r.ok) throw new Error(d?.error || 'No se pudo restaurar');
          toast('Copia restaurada'); setTimeout(() => location.reload(), 900);
        } catch (e) { toast(e.message, { error: true }); }
      });
    } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
  }
  return { montar };
})();