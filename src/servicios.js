// Edición de precios de la carta y "actualizar precios %".
// Cada cobro guarda el precio de ese momento: cambiar la carta no altera cobros anteriores.
const express = require('express');
const { db, audit } = require('./db');
const { ApiError, cfg } = require('./util');

const router = express.Router();
// efectivo = lista menos el descuento configurado; los cortes tienen precio fijo
const efectivoDe = (lista, categoria) => (categoria === 'corte' ? lista : Math.round(lista * (100 - Number(cfg('descuento_efectivo_pct') || 0)) / 100));

router.put('/variantes/:id', (req, res) => {
  const precio = Number(req.body?.precio);
  if (!Number.isInteger(precio) || precio <= 0) throw new ApiError(400, 'El precio debe ser un número entero mayor a 0');
  const v = db.prepare('SELECT v.id, v.precio_tarjeta, s.categoria FROM servicio_variante v JOIN servicio s ON s.id = v.servicio_id WHERE v.id = ?').get(req.params.id);
  if (!v) throw new ApiError(404, 'Servicio inexistente');
  const efectivo = efectivoDe(precio, v.categoria);
  db.prepare('UPDATE servicio_variante SET precio_tarjeta = ?, precio_efectivo = ? WHERE id = ?').run(precio, efectivo, v.id);
  audit('precio', v.id, 'editar', { antes: v.precio_tarjeta, despues: precio });
  res.json({ id: v.id, precio_tarjeta: precio, precio_efectivo: efectivo });
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
  if (db.prepare('SELECT 1 FROM servicio WHERE nombre = ?').get(nombre)) throw new ApiError(409, 'Ya existe un servicio con ese nombre');
  const id = db.transaction(() => {
    const sid = db.prepare('INSERT INTO servicio(nombre, categoria, grupo, subgrupo, duracion_texto) VALUES (?,?,?,?,?)')
      .run(nombre, b.categoria, grupo, subgrupo, b.categoria === 'corte' ? null : String(b.duracion_texto || '').trim() || null).lastInsertRowid;
    const ins = db.prepare('INSERT INTO servicio_variante(servicio_id, etiqueta, precio_tarjeta, precio_efectivo, precio_desde) VALUES (?,?,?,?,?)');
    vars.forEach((v, i) => ins.run(sid, etiquetas[i], Number(v.precio), efectivoDe(Number(v.precio), b.categoria), v.desde ? 1 : 0));
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
  if (db.prepare('SELECT 1 FROM servicio_variante WHERE servicio_id = ? AND etiqueta = ?').get(s.id, etiqueta)) throw new ApiError(409, 'Esa opción ya existe');
  const id = db.prepare('INSERT INTO servicio_variante(servicio_id, etiqueta, precio_tarjeta, precio_efectivo, precio_desde) VALUES (?,?,?,?,?)')
    .run(s.id, etiqueta, precio, efectivoDe(precio, s.categoria), req.body?.desde ? 1 : 0).lastInsertRowid;
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