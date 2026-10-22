// Pantalla COPIAS DE SEGURIDAD: copia manual, carpeta sincronizada (Drive/iCloud), exportación y restauración.
const Copias = (() => {
  const MOT = { auto: 'Automática', manual: 'Manual', cierre: 'Al cerrar la caja', 'pre-restauracion': 'Antes de restaurar' };
  let el;
  const fecha = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;

  async function montar(contenedor) {
    el = contenedor; el.onclick = onClick; el.onchange = null; el.oninput = null;
    await pintar();
  }

  async function pintar() {
    const d = await api('GET', '/api/copias');
    const ult = d.copias[0];
    const estadoSync = !d.carpeta_sync ? 'Sin carpeta configurada: las copias quedan solo en esta computadora.'
      : d.sync_ok ? `Se copia automáticamente en: ${d.carpeta_sync}` : `No se puede escribir en ${d.carpeta_sync}. Revisá que la carpeta exista.`;
    el.innerHTML = `<h1>Copias de seguridad</h1>
      <div class="copias-grid">
        <div class="panel"><div class="eyebrow">Última copia</div><div class="grande">${ult ? fecha(ult.fecha) : 'Todavía no hay'}</div>
          <p class="nota">${ult ? MOT[ult.motivo] : 'Se hace una automática por día.'} · Se conservan todas, no se borra ninguna.</p>
          <button class="btn-verde" data-acc="copiar">Hacer copia ahora</button></div>
        <div class="panel"><div class="eyebrow">Copia en la nube (Google Drive / iCloud)</div>
          <p class="nota ${d.carpeta_sync && !d.sync_ok ? 'mal' : ''}" style="margin-top:8px">${h(estadoSync)}</p>
          <div class="fila-sync"><input type="text" id="cp-carpeta" placeholder="Carpeta sincronizada" value="${h(d.carpeta_sync || '')}"><button class="btn-oro" data-acc="carpeta">Guardar</button></div>
          <p class="nota" style="margin-top:8px">Elegí una carpeta dentro de Google Drive para escritorio o iCloud Drive; ellos la suben a la nube. Dejalo vacío para desactivar.</p></div>
      </div>
      <div class="panel exp"><div class="eyebrow">Exportar para leer en Excel</div>
        <div class="exportar"><a href="/api/copias/exportar/cobros">Cobros (CSV)</a><a href="/api/copias/exportar/clientas">Clientas (CSV)</a><a href="/api/copias/exportar/movimientos">Movimientos (CSV)</a><a href="/api/copias/exportar/auditoria">Historial de cambios (CSV)</a></div></div>
      <div class="panel"><div class="eyebrow">Copias guardadas</div>
        ${d.copias.length ? `<table class="tabla"><tr><th>Fecha</th><th>Tipo</th><th class="r">Tamaño</th><th></th></tr>${d.copias.map((c, i) => `<tr><td>${fecha(c.fecha)}${i === 0 ? '<span class="nuevo">Más reciente</span>' : ''}</td><td><span class="tag m-${c.motivo}">${MOT[c.motivo]}</span></td><td class="r">${Math.max(1, Math.round(c.tam / 1024))} KB</td>
          <td class="r"><button class="btn-lnk" data-acc="restaurar" data-n="${h(c.nombre)}">Restaurar</button></td></tr>`).join('')}</table>
        <p class="nota">Al restaurar, antes se guarda una copia del estado actual (tipo "Antes de restaurar").</p>` : '<p class="nota">No hay copias todavía.</p>'}</div>`;
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    try {
      const a = b.dataset.acc;
      if (a === 'copiar') { const r = await api('POST', '/api/copias'); estadoGuardado(true); toast(r.sync === false ? 'Copia hecha, pero no se pudo copiar a la carpeta sincronizada' : 'Copia hecha', { error: r.sync === false }); await pintar(); }
      else if (a === 'carpeta') { await api('PUT', '/api/copias/config', { carpeta: $('#cp-carpeta', el).value }); toast('Carpeta guardada'); await pintar(); }
      else if (a === 'restaurar') doble(b, '¿Seguro? Reemplaza los datos actuales', async () => {
        try { await api('POST', `/api/copias/${encodeURIComponent(b.dataset.n)}/restaurar`); toast('Copia restaurada'); setTimeout(() => location.reload(), 900); }
        catch (e) { toast(e.message, { error: true }); }
      });
    } catch (e) { estadoGuardado(false); toast(e.message, { error: true }); }
  }
  return { montar };
})();