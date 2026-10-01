const express = require('express');
const { db, audit } = require('./db');
const { ApiError, cfg } = require('./util');

const CATS = ['corte', 'color', 'nutri', 'otro'];
const MODOS = ['porcentaje', 'hora'];
const router = express.Router();

// Pago por defecto: color por hora (valor a configurar); el resto, porcentaje
const defecto = (cat) => (cat === 'color'
  ? { modo: 'hora', valor: 0 }
  : { modo: 'porcentaje', valor: Number(cfg('comision_default_pct') || 0) });

function cargar(id) {
  const e = db.prepare('SELECT id, nombre, activo FROM empleado WHERE id = ?').get(id);
  if (!e) return null;
  const filas = db.prepare('SELECT categoria, modo, valor FROM pago_empleado WHERE empleado_id = ?').all(id);
  return {
    id: e.id, nombre: e.nombre, activo: e.activo,
    pagos: Object.fromEntries(CATS.map((c) => {
      const f = filas.find((x) => x.categoria === c);
      return [c, f ? { modo: f.modo, valor: f.valor } : defecto(c)];
    })),
  };
}

function validarPago(cat, p) {
  if (!CATS.includes(cat)) throw new ApiError(400, `Categoría inválida: ${cat}`);
  const modo = p?.modo ?? defecto(cat).modo;
  const valor = Number(p?.valor);
  if (!MODOS.includes(modo)) throw new ApiError(400, `Modo de pago inválido en ${cat}`);
  if (!(valor >= 0) || (modo === 'porcentaje' && valor > 100)) throw new ApiError(400, `Valor inválido en ${cat}`);
  return { modo, valor };
}

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT id FROM empleado ORDER BY activo DESC, nombre').all().map((r) => cargar(r.id)));
});

router.post('/', (req, res) => {
  const { nombre, pagos = {} } = req.body || {};
  if (!nombre?.trim()) throw new ApiError(400, 'Falta el nombre');
  const id = db.transaction(() => {
    const id = db.prepare('INSERT INTO empleado(nombre) VALUES (?)').run(nombre.trim()).lastInsertRowid;
    const ins = db.prepare('INSERT INTO pago_empleado(empleado_id, categoria, modo, valor) VALUES (?,?,?,?)');
    for (const c of CATS) {
      const p = validarPago(c, pagos[c] ?? defecto(c));
      ins.run(id, c, p.modo, p.valor);
    }
    audit('empleado', id, 'crear', { nombre: nombre.trim() });
    return id;
  })();
  res.status(201).json(cargar(id));
});

// Editar nombre, activo y el pago por categoría (% o valor por hora)
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const antes = cargar(id);
  if (!antes) throw new ApiError(404, 'Empleado inexistente');
  const { nombre, activo, pagos } = req.body || {};
  db.transaction(() => {
    if (nombre !== undefined) {
      if (!nombre.trim()) throw new ApiError(400, 'Nombre vacío');
      db.prepare('UPDATE empleado SET nombre = ? WHERE id = ?').run(nombre.trim(), id);
    }
    if (activo !== undefined) db.prepare('UPDATE empleado SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
    for (const [c, p] of Object.entries(pagos || {})) {
      const v = validarPago(c, { modo: p.modo ?? antes.pagos[c]?.modo, valor: p.valor ?? antes.pagos[c]?.valor });
      db.prepare(`INSERT INTO pago_empleado(empleado_id, categoria, modo, valor) VALUES (?,?,?,?)
        ON CONFLICT(empleado_id, categoria) DO UPDATE SET modo = excluded.modo, valor = excluded.valor`)
        .run(id, c, v.modo, v.valor);
    }
    audit('empleado', id, 'editar', { antes, cambios: req.body });
  })();
  res.json(cargar(id));
});

module.exports = { router, cargar };