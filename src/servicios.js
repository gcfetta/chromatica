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