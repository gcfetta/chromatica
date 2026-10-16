// Edición de precios de la carta y "actualizar precios %".
// Cada cobro guarda el precio de ese momento: cambiar la carta no altera cobros anteriores.
const express = require('express');
const { db, audit } = require('./db');
const { ApiError, cfg } = require('./util');

const router = express.Router();
// efectivo = lista menos el descuento configurado; los cortes tienen precio fijo
const efectivoDe = (lista, categoria) => (categoria === 'corte' ? lista : Math.round(lista * (100 - Number(cfg('descuento_efectivo_pct') || 0)) / 100));

const norm = (x) => String(x ?? '').trim();
const niveles = () => { try { const l = JSON.parse(cfg('niveles') || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };
const guardarNiveles = (l) => db.prepare('INSERT INTO config(clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run('niveles', JSON.stringify(l));
const usadaVariante = (id) => !!db.prepare('SELECT 1 FROM turno_servicio WHERE variante_id = ? LIMIT 1').get(id);
const usadoServicio = (id) => !!db.prepare('SELECT 1 FROM turno_servicio ts JOIN servicio_variante v ON v.id = ts.variante_id WHERE v.servicio_id = ? LIMIT 1').get(id);
const sigOrden = (tabla) => (db.prepare(`SELECT COALESCE(MAX(orden),0)+1 n FROM ${tabla}`).get().n);
// Una opción dada de baja con el mismo nombre se renombra para no bloquear el nombre nuevo
function liberarEtiqueta(sid, etiqueta) {
  const v = db.prepare('SELECT id FROM servicio_variante WHERE servicio_id = ? AND etiqueta = ? AND activo = 0').get(sid, etiqueta);
  if (v) db.prepare('UPDATE servicio_variante SET etiqueta = ? WHERE id = ?').run(`${etiqueta} (baja #${v.id})`, v.id);
}
// Elimina de verdad si nunca se cobró; si no, la da de baja (los cobros viejos guardan su propio texto)
function borrarVariante(id) {
  if (usadaVariante(id)) db.prepare('UPDATE servicio_variante SET activo = 0 WHERE id = ?').run(id);
  else db.prepare('DELETE FROM servicio_variante WHERE id = ?').run(id);
}
const activas = (sid) => db.prepare('SELECT COUNT(*) n FROM servicio_variante WHERE servicio_id = ? AND activo = 1').get(sid).n;

router.put('/variantes/:id', (req, res) => {
  const b = req.body || {};
  const v = db.prepare('SELECT v.id, v.servicio_id, v.etiqueta, v.precio_tarjeta, v.precio_desde, s.categoria FROM servicio_variante v JOIN servicio s ON s.id = v.servicio_id WHERE v.id = ?').get(req.params.id);
  if (!v) throw new ApiError(404, 'Servicio inexistente');
  const precio = b.precio === undefined ? v.precio_tarjeta : Number(b.precio);
  if (!Number.isInteger(precio) || precio <= 0) throw new ApiError(400, 'El precio debe ser un número entero mayor a 0');
  const etiqueta = b.etiqueta === undefined ? v.etiqueta : (norm(b.etiqueta) || 'Único');
  if (etiqueta !== v.etiqueta && db.prepare('SELECT 1 FROM servicio_variante WHERE servicio_id = ? AND etiqueta = ? AND activo = 1 AND id <> ?').get(v.servicio_id, etiqueta, v.id)) throw new ApiError(409, 'Esa opción ya existe en este servicio');
  const desde = b.desde === undefined ? v.precio_desde : (b.desde ? 1 : 0);
  const efectivo = efectivoDe(precio, v.categoria);
  db.transaction(() => {
    if (etiqueta !== v.etiqueta) liberarEtiqueta(v.servicio_id, etiqueta);
    db.prepare('UPDATE servicio_variante SET precio_tarjeta = ?, precio_efectivo = ?, etiqueta = ?, precio_desde = ? WHERE id = ?').run(precio, efectivo, etiqueta, desde, v.id);
    audit('precio', v.id, 'editar', { antes: v.precio_tarjeta, despues: precio, etiqueta });
  })();
  res.json({ id: v.id, precio_tarjeta: precio, precio_efectivo: efectivo, etiqueta, precio_desde: desde });
});

router.delete('/variantes/:id', (req, res) => {
  const v = db.prepare('SELECT id, servicio_id, etiqueta FROM servicio_variante WHERE id = ? AND activo = 1').get(req.params.id);
  if (!v) throw new ApiError(404, 'Opción inexistente');
  if (activas(v.servicio_id) <= 1) throw new ApiError(409, 'Un servicio necesita al menos una opción. Si no lo usás más, eliminá el servicio.');
  db.transaction(() => { borrarVariante(v.id); audit('servicio', v.servicio_id, 'quitar_opcion', { etiqueta: v.etiqueta }); })();
  res.json({ ok: true });
});

// Mueve una opción hacia arriba (-1) o abajo (1) dentro de su servicio
router.post('/variantes/:id/mover', (req, res) => {
  const v = db.prepare('SELECT id, servicio_id, orden FROM servicio_variante WHERE id = ? AND activo = 1').get(req.params.id);
  if (!v) throw new ApiError(404, 'Opción inexistente');
  const dir = Number(req.body?.dir) < 0 ? -1 : 1;
  const vecino = db.prepare(`SELECT id, orden FROM servicio_variante WHERE servicio_id = ? AND activo = 1 AND (orden ${dir < 0 ? '<' : '>'} ? OR (orden = ? AND id ${dir < 0 ? '<' : '>'} ?))
    ORDER BY orden ${dir < 0 ? 'DESC' : 'ASC'}, id ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`).get(v.servicio_id, v.orden, v.orden, v.id);
  if (vecino) db.transaction(() => {
    const up = db.prepare('UPDATE servicio_variante SET orden = ? WHERE id = ?');
    if (vecino.orden === v.orden) { up.run(vecino.orden + dir, v.id); } else { up.run(vecino.orden, v.id); up.run(v.orden, vecino.id); }
  })();
  res.json({ ok: true });
});

// ---- categorías (niveles: Plus, Premium, Mega premium…) ----
const enUso = (nombre) => db.prepare("SELECT COUNT(*) n FROM servicio_variante WHERE activo = 1 AND (etiqueta = ? OR etiqueta LIKE ? || ' · %')").get(nombre, nombre).n;
router.get('/categorias', (_req, res) => res.json(niveles().map((nombre) => ({ nombre, en_uso: enUso(nombre) }))));
router.post('/categorias', (req, res) => {
  const nombre = norm(req.body?.nombre);
  if (!nombre) throw new ApiError(400, 'Falta el nombre de la categoría');
  if (nombre.includes(' · ')) throw new ApiError(400, 'El nombre no puede contener " · "');
  const l = niveles();
  if (l.some((x) => x.toLowerCase() === nombre.toLowerCase())) throw new ApiError(409, 'Esa categoría ya existe');
  guardarNiveles([...l, nombre]); audit('categoria', null, 'crear', { nombre });
  res.status(201).json({ ok: true });
});
router.put('/categorias', (req, res) => {   // { nombre, nuevo } renombra; { nombre, dir } reordena
  const nombre = norm(req.body?.nombre), l = niveles(), i = l.indexOf(nombre);
  if (i < 0) throw new ApiError(404, 'Categoría inexistente');
  if (req.body?.dir) {
    const j = i + (Number(req.body.dir) < 0 ? -1 : 1);
    if (j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; guardarNiveles(l); }
    return res.json({ ok: true });
  }
  const nuevo = norm(req.body?.nuevo);
  if (!nuevo || nuevo.includes(' · ')) throw new ApiError(400, 'Nombre inválido');
  if (l.some((x, k) => k !== i && x.toLowerCase() === nuevo.toLowerCase())) throw new ApiError(409, 'Esa categoría ya existe');
  db.transaction(() => {
    const filas = db.prepare("SELECT id, servicio_id, etiqueta FROM servicio_variante WHERE etiqueta = ? OR etiqueta LIKE ? || ' · %'").all(nombre, nombre);
    for (const f of filas) {
      const e = nuevo + f.etiqueta.slice(nombre.length);
      liberarEtiqueta(f.servicio_id, e);
      db.prepare('UPDATE servicio_variante SET etiqueta = ? WHERE id = ?').run(e, f.id);
    }
    l[i] = nuevo; guardarNiveles(l); audit('categoria', null, 'renombrar', { nombre, nuevo });
  })();
  res.json({ ok: true });
});
router.delete('/categorias', (req, res) => {
  const nombre = norm(req.body?.nombre), l = niveles();
  if (!l.includes(nombre)) throw new ApiError(404, 'Categoría inexistente');
  const n = enUso(nombre);
  if (n) throw new ApiError(409, `«${nombre}» se usa en ${n} opción(es). Quitala primero de esos servicios (en la card, con «Quitar categoría»).`);
  guardarNiveles(l.filter((x) => x !== nombre)); audit('categoria', null, 'eliminar', { nombre });
  res.json({ ok: true });
});
// Quita de un servicio todas las opciones de una categoría
router.delete('/:id/categoria', (req, res) => {
  const sid = Number(req.params.id), nombre = norm(req.body?.nombre);
  const filas = db.prepare("SELECT id FROM servicio_variante WHERE servicio_id = ? AND activo = 1 AND (etiqueta = ? OR etiqueta LIKE ? || ' · %')").all(sid, nombre, nombre);
  if (!filas.length) throw new ApiError(404, 'Ese servicio no tiene esa categoría');
  if (activas(sid) - filas.length < 1) throw new ApiError(409, 'El servicio se quedaría sin opciones. Si no lo usás más, eliminá el servicio.');
  db.transaction(() => { filas.forEach((f) => borrarVariante(f.id)); audit('servicio', sid, 'quitar_categoria', { nombre, opciones: filas.length }); })();
  res.json({ ok: true });
});

// ---- servicios: editar, eliminar, reordenar ----
router.put('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM servicio WHERE id = ? AND activo = 1').get(req.params.id);
  if (!s) throw new ApiError(404, 'Servicio inexistente');
  const b = req.body || {};
  const nombre = b.nombre === undefined ? s.nombre : norm(b.nombre);
  if (!nombre) throw new ApiError(400, 'Falta el nombre del servicio');
  if (nombre !== s.nombre && db.prepare('SELECT 1 FROM servicio WHERE nombre = ? AND activo = 1 AND id <> ?').get(nombre, s.id)) throw new ApiError(409, 'Ya existe un servicio con ese nombre');
  const grupo = b.grupo === undefined ? s.grupo : norm(b.grupo);
  if (!grupo) throw new ApiError(400, 'Falta el grupo');
  let sub = s.subgrupo;
  if (s.categoria === 'corte' && b.subgrupo !== undefined) { sub = norm(b.subgrupo); if (!['Corto', 'Largo'].includes(sub)) throw new ApiError(400, 'Los cortes son Corto o Largo'); }
  const dur = s.categoria === 'corte' ? null : (b.duracion_texto === undefined ? s.duracion_texto : norm(b.duracion_texto) || null);
  db.transaction(() => {
    if (nombre !== s.nombre) liberarNombre(nombre);
    db.prepare('UPDATE servicio SET nombre = ?, grupo = ?, subgrupo = ?, duracion_texto = ? WHERE id = ?').run(nombre, grupo, sub, dur, s.id);
    audit('servicio', s.id, 'editar', { antes: { nombre: s.nombre, grupo: s.grupo, subgrupo: s.subgrupo }, despues: { nombre, grupo, subgrupo: sub } });
  })();
  res.json({ ok: true });
});
function liberarNombre(nombre) {
  const x = db.prepare('SELECT id FROM servicio WHERE nombre = ? AND activo = 0').get(nombre);
  if (x) db.prepare('UPDATE servicio SET nombre = ? WHERE id = ?').run(`${nombre} (baja #${x.id})`, x.id);
}
router.delete('/:id', (req, res) => {
  const s = db.prepare('SELECT id, nombre FROM servicio WHERE id = ? AND activo = 1').get(req.params.id);
  if (!s) throw new ApiError(404, 'Servicio inexistente');
  db.transaction(() => {
    if (usadoServicio(s.id)) {      // tiene cobros: se da de baja, no desaparece del historial
      db.prepare('UPDATE servicio SET activo = 0 WHERE id = ?').run(s.id);
      db.prepare('UPDATE servicio_variante SET activo = 0 WHERE servicio_id = ?').run(s.id);
    } else {
      db.prepare('DELETE FROM servicio_variante WHERE servicio_id = ?').run(s.id);
      db.prepare('DELETE FROM servicio WHERE id = ?').run(s.id);
    }
    audit('servicio', s.id, 'eliminar', { nombre: s.nombre });
  })();
  res.json({ ok: true });
});
router.post('/:id/mover', (req, res) => {   // dentro de su mismo grupo
  const s = db.prepare('SELECT id, categoria, grupo, subgrupo, orden FROM servicio WHERE id = ? AND activo = 1').get(req.params.id);
  if (!s) throw new ApiError(404, 'Servicio inexistente');
  const dir = Number(req.body?.dir) < 0 ? -1 : 1, op = dir < 0 ? '<' : '>', ord = dir < 0 ? 'DESC' : 'ASC';
  const v = db.prepare(`SELECT id, orden FROM servicio WHERE activo = 1 AND categoria = ? AND IFNULL(grupo,'') = IFNULL(?,'') AND IFNULL(subgrupo,'') = IFNULL(?,'')
    AND (orden ${op} ? OR (orden = ? AND id ${op} ?)) ORDER BY orden ${ord}, id ${ord} LIMIT 1`).get(s.categoria, s.grupo, s.subgrupo, s.orden, s.orden, s.id);
  if (v) db.transaction(() => {
    const up = db.prepare('UPDATE servicio SET orden = ? WHERE id = ?');
    if (v.orden === s.orden) up.run(v.orden + dir, s.id); else { up.run(v.orden, s.id); up.run(s.orden, v.id); }
  })();
  res.json({ ok: true });
});

// Nuevo servicio con sus variantes: { nombre, categoria, grupo, subgrupo?, duracion_texto?, variantes: [{ etiqueta?, precio, desde? }] }
router.post('/', (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || '').trim();
  if (!nombre) throw new ApiError(400, 'Falta el nombre del servicio');
  if (!['corte', 'color', 'nutri'].includes(b.categoria)) throw new ApiError(400, 'Categoría inválida');
  const grupo = String(b.grupo || '').trim();
  if (!grupo) throw new ApiError(400, 'Falta el grupo');
  const subgrupo = b.categoria === 'corte' ? String(b.subgrupo || '') : null;
  if (b.categoria === 'corte' && !['Corto', 'Largo'].includes(subgrupo)) throw new ApiError(400, 'Los cortes son Corto o Largo');
  const vars = Array.isArray(b.variantes) ? b.variantes : [];
  if (!vars.length) throw new ApiError(400, 'Cargá al menos un precio');
  const etiquetas = vars.map((v) => String(v.etiqueta || 'Único').trim() || 'Único');
  if (new Set(etiquetas).size !== etiquetas.length) throw new ApiError(400, 'Hay opciones repetidas');
  vars.forEach((v) => { if (!Number.isInteger(Number(v.precio)) || Number(v.precio) <= 0) throw new ApiError(400, 'Cada precio debe ser un número entero mayor a 0'); });
  if (db.prepare('SELECT 1 FROM servicio WHERE nombre = ? AND activo = 1').get(nombre)) throw new ApiError(409, 'Ya existe un servicio con ese nombre');
  const id = db.transaction(() => {
    liberarNombre(nombre);
    const sid = db.prepare('INSERT INTO servicio(nombre, categoria, grupo, subgrupo, duracion_texto, orden) VALUES (?,?,?,?,?,?)')
      .run(nombre, b.categoria, grupo, subgrupo, b.categoria === 'corte' ? null : String(b.duracion_texto || '').trim() || null, sigOrden('servicio')).lastInsertRowid;
    const ins = db.prepare('INSERT INTO servicio_variante(servicio_id, etiqueta, precio_tarjeta, precio_efectivo, precio_desde, orden) VALUES (?,?,?,?,?,?)');
    const o0 = sigOrden('servicio_variante');
    vars.forEach((v, i) => ins.run(sid, etiquetas[i], Number(v.precio), efectivoDe(Number(v.precio), b.categoria), v.desde ? 1 : 0, o0 + i));
    audit('servicio', sid, 'crear', { nombre, categoria: b.categoria, grupo, variantes: vars.length });
    return sid;
  })();
  res.status(201).json({ id });
});

// Agregar una variante (opción/talle/nivel) a un servicio existente
router.post('/:id/variantes', (req, res) => {
  const s = db.prepare('SELECT id, categoria FROM servicio WHERE id = ?').get(req.params.id);
  if (!s) throw new ApiError(404, 'Servicio inexistente');
  const etiqueta = String(req.body?.etiqueta || '').trim();
  const precio = Number(req.body?.precio);
  if (!etiqueta) throw new ApiError(400, 'Falta el nombre de la opción');
  if (!Number.isInteger(precio) || precio <= 0) throw new ApiError(400, 'El precio debe ser un número entero mayor a 0');
  if (db.prepare('SELECT 1 FROM servicio_variante WHERE servicio_id = ? AND etiqueta = ? AND activo = 1').get(s.id, etiqueta)) throw new ApiError(409, 'Esa opción ya existe');
    liberarEtiqueta(s.id, etiqueta);
  const id = db.prepare('INSERT INTO servicio_variante(servicio_id, etiqueta, precio_tarjeta, precio_efectivo, precio_desde, orden) VALUES (?,?,?,?,?,?)')
    .run(s.id, etiqueta, precio, efectivoDe(precio, s.categoria), req.body?.desde ? 1 : 0, sigOrden('servicio_variante')).lastInsertRowid;
  audit('servicio', s.id, 'variante', { etiqueta, precio });
  res.status(201).json({ id });
});

// body: { porcentaje, grupo: 'todos' | nombre del grupo, redondeo: 1|100|500|1000, aplicar: bool }
// sin aplicar devuelve solo la vista previa
router.post('/actualizar-precios', (req, res) => {
  const pct = Number(req.body?.porcentaje);
  if (!Number.isFinite(pct) || pct === 0 || pct < -50 || pct > 200) throw new ApiError(400, 'El porcentaje debe estar entre -50 y 200, y no ser 0');
  const red = Number(req.body?.redondeo ?? 500);
  if (![1, 100, 500, 1000].includes(red)) throw new ApiError(400, 'Redondeo inválido');
  const grupo = req.body?.grupo && req.body.grupo !== 'todos' ? String(req.body.grupo) : null;
  const filas = db.prepare(`SELECT v.id, v.etiqueta, v.precio_tarjeta, s.nombre, s.categoria FROM servicio_variante v JOIN servicio s ON s.id = v.servicio_id
    WHERE v.activo = 1 AND s.activo = 1 ${grupo ? 'AND s.grupo = ?' : ''} ORDER BY s.id, v.id`).all(...(grupo ? [grupo] : []));
  const cambios = filas.map((f) => ({ ...f, despues: Math.max(red, Math.round((f.precio_tarjeta * (1 + pct / 100)) / red) * red) }))
    .filter((c) => c.despues !== c.precio_tarjeta);
  if (!cambios.length) throw new ApiError(400, 'No hay precios para actualizar con esos datos');
  if (req.body?.aplicar === true) {
    const up = db.prepare('UPDATE servicio_variante SET precio_tarjeta = ?, precio_efectivo = ? WHERE id = ?');
    db.transaction(() => {
      for (const c of cambios) up.run(c.despues, efectivoDe(c.despues, c.categoria), c.id);
      audit('precio', null, 'actualizar_porcentaje', { porcentaje: pct, grupo: grupo || 'todos', redondeo: red, cambios: cambios.map((c) => [c.id, c.precio_tarjeta, c.despues]) });
    })();
  }
  res.json({
    aplicado: req.body?.aplicar === true, cantidad: cambios.length,
    ejemplos: cambios.slice(0, 6).map((c) => ({ servicio: c.nombre, variante: c.etiqueta, antes: c.precio_tarjeta, despues: c.despues })),
  });
});

module.exports = { router };