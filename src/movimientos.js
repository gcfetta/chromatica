const express = require('express');
const { db, audit } = require('./db');
const { ApiError } = require('./util');
const { normalizarFecha } = require('./fechas');

const router = express.Router();
const TIPOS = ['adelanto', 'gasto', 'retiro'];

const get = (id) => db.prepare(`SELECT m.*, e.nombre AS empleado FROM movimiento m
  LEFT JOIN empleado e ON e.id = m.empleado_id WHERE m.id = ?`).get(id);

function validar(b, previo = {}) {
  const tipo = b.tipo ?? previo.tipo;
  if (!TIPOS.includes(tipo)) throw new ApiError(400, 'Tipo inválido (adelanto, gasto o retiro)');
  const monto = Math.round(Number(b.monto ?? previo.monto));
  if (!(monto > 0)) throw new ApiError(400, 'El monto debe ser mayor a 0');
  const empleado_id = 'empleado_id' in b ? b.empleado_id : previo.empleado_id;
  if (tipo === 'adelanto') {
    if (!empleado_id || !db.prepare('SELECT 1 FROM empleado WHERE id = ?').get(Number(empleado_id)))
      throw new ApiError(400, 'El adelanto necesita un empleado válido');
  }
  return { tipo, monto, empleado_id: tipo === 'adelanto' ? Number(empleado_id) : null,
    concepto: (b.concepto ?? previo.concepto ?? '').toString().trim() || null };
}

// ?estado=abiertos (por defecto: todavía sin cierre) | todos
router.get('/', (req, res) => {
  const soloAbiertos = (req.query.estado || 'abiertos') === 'abiertos';
  res.json(db.prepare(`SELECT m.*, e.nombre AS empleado FROM movimiento m
    LEFT JOIN empleado e ON e.id = m.empleado_id
    WHERE m.anulado = 0 ${soloAbiertos ? 'AND m.cierre_id IS NULL' : ''}
    ORDER BY m.fecha DESC, m.id DESC`).all());
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const v = validar(b);
  const fecha = normalizarFecha(b.fecha);
  const id = db.transaction(() => {
    const id = db.prepare(`INSERT INTO movimiento(fecha, tipo, empleado_id, monto, concepto)
      VALUES (COALESCE(?, datetime('now','localtime')), ?, ?, ?, ?)`).run(fecha, v.tipo, v.empleado_id, v.monto, v.concepto).lastInsertRowid;
    audit('movimiento', id, 'crear', v);
    return id;
  })();
  res.status(201).json(get(id));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const m = get(id);
  if (!m) throw new ApiError(404, 'Movimiento inexistente');
  if (m.anulado) throw new ApiError(409, 'El movimiento está anulado');
  if (m.cierre_id) throw new ApiError(409, 'El movimiento ya está en un cierre de caja');
  const b = req.body || {};
  const v = validar(b, m);
  const fecha = 'fecha' in b ? normalizarFecha(b.fecha) : m.fecha;
  db.transaction(() => {
    db.prepare('UPDATE movimiento SET fecha = ?, tipo = ?, empleado_id = ?, monto = ?, concepto = ? WHERE id = ?')
      .run(fecha || m.fecha, v.tipo, v.empleado_id, v.monto, v.concepto, id);
    audit('movimiento', id, 'editar', { antes: { tipo: m.tipo, monto: m.monto, concepto: m.concepto, fecha: m.fecha }, despues: { ...v, fecha } });
  })();
  res.json(get(id));
});

router.post('/:id/anular', (req, res) => {
  const id = Number(req.params.id);
  const m = get(id);
  if (!m) throw new ApiError(404, 'Movimiento inexistente');
  if (m.anulado) throw new ApiError(409, 'Ya estaba anulado');
  if (m.cierre_id) throw new ApiError(409, 'El movimiento ya está en un cierre de caja');
  db.transaction(() => {
    db.prepare('UPDATE movimiento SET anulado = 1 WHERE id = ?').run(id);
    audit('movimiento', id, 'anular', { motivo: req.body?.motivo ?? null });
  })();
  res.json(get(id));
});

module.exports = { router };