const express = require('express');
const { db, audit } = require('./db');
const { ApiError } = require('./util');

const router = express.Router();
const CAMPOS = ['nombre', 'contacto', 'ficha', 'observacion', 'notas_importantes'];

router.get('/', (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  res.json(db.prepare(`SELECT id, nombre, contacto, ficha, observacion, notas_importantes, activo
    FROM cliente WHERE activo = 1 AND nombre LIKE ? ORDER BY nombre LIMIT 50`).all(q));
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM cliente WHERE id = ?').get(Number(req.params.id));
  if (!c) throw new ApiError(404, 'Clienta inexistente');
  const historial = db.prepare(`
    SELECT t.id AS cobro_id, t.fecha, t.total, t.ficha, ts.recorrido, ts.precio_cobrado, t.anulado
    FROM turno t JOIN turno_servicio ts ON ts.turno_id = t.id
    WHERE t.cliente_id = ? ORDER BY t.fecha DESC, ts.id`).all(c.id);
  res.json({ ...c, historial });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.nombre?.trim()) throw new ApiError(400, 'Falta el nombre');
  const id = db.prepare(`INSERT INTO cliente(nombre, contacto, ficha, observacion, notas_importantes)
    VALUES (?,?,?,?,?)`).run(b.nombre.trim(), b.contacto ?? null, b.ficha ?? null, b.observacion ?? null,
    b.notas_importantes ?? null).lastInsertRowid;
  audit('cliente', id, 'crear', { nombre: b.nombre.trim() });
  res.status(201).json(db.prepare('SELECT * FROM cliente WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const antes = db.prepare('SELECT * FROM cliente WHERE id = ?').get(id);
  if (!antes) throw new ApiError(404, 'Clienta inexistente');
  const b = req.body || {};
  db.transaction(() => {
    for (const k of CAMPOS) {
      if (b[k] === undefined) continue;
      if (k === 'nombre' && !String(b[k]).trim()) throw new ApiError(400, 'Nombre vacío');
      db.prepare(`UPDATE cliente SET ${k} = ? WHERE id = ?`).run(b[k], id);
    }
    if (b.activo !== undefined) db.prepare('UPDATE cliente SET activo = ? WHERE id = ?').run(b.activo ? 1 : 0, id);
    audit('cliente', id, 'editar', { antes: { ...antes }, cambios: b });
  })();
  res.json(db.prepare('SELECT * FROM cliente WHERE id = ?').get(id));
});

module.exports = { router };