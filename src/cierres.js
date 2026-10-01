const express = require('express');
const { db, audit } = require('./db');
const { ApiError } = require('./util');
const { normalizarFecha } = require('./fechas');

const router = express.Router();
const ahora = () => db.prepare("SELECT datetime('now','localtime') AS f").get().f;

// Calcula lo que entraría en un cierre hasta una fecha: todo lo que todavía no fue cerrado
function calcular(hasta) {
  const lineas = db.prepare(`SELECT ts.*, t.fecha, e.nombre AS empleado FROM turno_servicio ts
    JOIN turno t ON t.id = ts.turno_id LEFT JOIN empleado e ON e.id = ts.empleado_id
    WHERE t.cierre_id IS NULL AND t.anulado = 0 AND t.fecha <= ?`).all(hasta);
  const cobros = db.prepare(`SELECT id, fecha, total FROM turno WHERE cierre_id IS NULL AND anulado = 0 AND fecha <= ?`).all(hasta);
  const movs = db.prepare(`SELECT * FROM movimiento WHERE cierre_id IS NULL AND anulado = 0 AND fecha <= ?`).all(hasta);

  const suma = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const porEmpleado = new Map();
  const emp = (id, nombre) => {
    if (!porEmpleado.has(id)) porEmpleado.set(id, { empleado_id: id, empleado: nombre, por_porcentaje: 0, por_horas: 0, pago_total: 0, adelantos: 0, neto: 0 });
    return porEmpleado.get(id);
  };
  for (const l of lineas.filter((x) => x.empleado_id)) {
    const e = emp(l.empleado_id, l.empleado);
    if (l.pago_modo === 'hora') e.por_horas += l.pago_monto; else e.por_porcentaje += l.pago_monto;
    e.pago_total += l.pago_monto;
  }
  for (const m of movs.filter((x) => x.tipo === 'adelanto')) {
    const nombre = db.prepare('SELECT nombre FROM empleado WHERE id = ?').get(m.empleado_id)?.nombre;
    emp(m.empleado_id, nombre).adelantos += m.monto;
  }
  for (const e of porEmpleado.values()) e.neto = e.pago_total - e.adelantos;

  const total_cobrado = suma(cobros, (c) => c.total);
  const pagos_empleados = suma(lineas, (l) => l.pago_monto);
  const gastos = suma(movs.filter((m) => m.tipo === 'gasto'), (m) => m.monto);
  const retiros = suma(movs.filter((m) => m.tipo === 'retiro'), (m) => m.monto);
  const ultimo = db.prepare('SELECT hasta FROM cierre WHERE anulado = 0 ORDER BY id DESC LIMIT 1').get();

  return {
    desde: ultimo?.hasta ?? (cobros.length ? cobros.map((c) => c.fecha).sort()[0] : null),
    hasta,
    cantidad_cobros: cobros.length,
    total_cobrado, pagos_empleados, gastos, retiros,
    ganancia_local: total_cobrado - pagos_empleados - gastos,   // los retiros no son gasto
    por_empleado: [...porEmpleado.values()],
    pendientes: lineas.filter((l) => l.pago_modo === 'hora' && l.horas == null)
      .map((l) => ({ cobro_id: l.turno_id, servicio_id: l.id, recorrido: l.recorrido, empleado: l.empleado })),
    movimientos: movs.length,
  };
}

const resolverHasta = (v) => (v ? normalizarFecha(v, true) : ahora());

// Vista previa: no guarda nada
router.get('/previa', (req, res) => res.json(calcular(resolverHasta(req.query.hasta))));

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM cierre ORDER BY id DESC').all());
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM cierre WHERE id = ?').get(id);
  if (!c) throw new ApiError(404, 'Cierre inexistente');
  res.json({
    ...c,
    por_empleado: db.prepare(`SELECT ce.*, e.nombre AS empleado FROM cierre_empleado ce
      JOIN empleado e ON e.id = ce.empleado_id WHERE ce.cierre_id = ?`).all(id),
    historial: db.prepare(`SELECT t.id AS cobro_id, t.fecha, cl.nombre AS clienta, ts.recorrido, ts.precio_cobrado
      FROM turno t JOIN turno_servicio ts ON ts.turno_id = t.id LEFT JOIN cliente cl ON cl.id = t.cliente_id
      WHERE t.cierre_id = ? ORDER BY t.fecha, ts.id`).all(id),
    movimientos: db.prepare(`SELECT m.*, e.nombre AS empleado FROM movimiento m LEFT JOIN empleado e ON e.id = m.empleado_id
      WHERE m.cierre_id = ? ORDER BY m.fecha`).all(id),
  });
});

// Cerrar la caja cuando se quiera: congela cobros y movimientos hasta la fecha elegida
router.post('/', (req, res) => {
  const hasta = resolverHasta(req.body?.hasta);
  const r = calcular(hasta);
  if (r.pendientes.length)
    return res.status(409).json({ error: 'Faltan cargar las horas de algunos servicios de color', pendientes: r.pendientes });
  if (!r.cantidad_cobros && !r.movimientos) throw new ApiError(400, 'No hay cobros ni movimientos para cerrar');

  const id = db.transaction(() => {
    const id = db.prepare(`INSERT INTO cierre(desde, hasta, cantidad_cobros, total_cobrado, pagos_empleados, gastos, retiros, ganancia_local, nota)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(r.desde, hasta, r.cantidad_cobros, r.total_cobrado, r.pagos_empleados, r.gastos,
      r.retiros, r.ganancia_local, req.body?.nota ?? null).lastInsertRowid;
    const ins = db.prepare('INSERT INTO cierre_empleado(cierre_id, empleado_id, por_porcentaje, por_horas, pago_total, adelantos, neto) VALUES (?,?,?,?,?,?,?)');
    for (const e of r.por_empleado) ins.run(id, e.empleado_id, e.por_porcentaje, e.por_horas, e.pago_total, e.adelantos, e.neto);
    db.prepare('UPDATE turno SET cierre_id = ? WHERE cierre_id IS NULL AND anulado = 0 AND fecha <= ?').run(id, hasta);
    db.prepare('UPDATE movimiento SET cierre_id = ? WHERE cierre_id IS NULL AND anulado = 0 AND fecha <= ?').run(id, hasta);
    audit('cierre', id, 'crear', { hasta, total_cobrado: r.total_cobrado, ganancia_local: r.ganancia_local });
    return id;
  })();
  res.status(201).json(db.prepare('SELECT * FROM cierre WHERE id = ?').get(id));
});

// Deshacer el último cierre (para corregir algo); los cobros vuelven a quedar abiertos
router.post('/:id/anular', (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM cierre WHERE id = ?').get(id);
  if (!c) throw new ApiError(404, 'Cierre inexistente');
  if (c.anulado) throw new ApiError(409, 'Ya estaba anulado');
  const ultimo = db.prepare('SELECT id FROM cierre WHERE anulado = 0 ORDER BY id DESC LIMIT 1').get();
  if (ultimo.id !== id) throw new ApiError(409, 'Solo se puede anular el último cierre');
  db.transaction(() => {
    db.prepare('UPDATE cierre SET anulado = 1 WHERE id = ?').run(id);
    db.prepare('UPDATE turno SET cierre_id = NULL WHERE cierre_id = ?').run(id);
    db.prepare('UPDATE movimiento SET cierre_id = NULL WHERE cierre_id = ?').run(id);
    audit('cierre', id, 'anular', { motivo: req.body?.motivo ?? null });
  })();
  res.json(db.prepare('SELECT * FROM cierre WHERE id = ?').get(id));
});

module.exports = { router };