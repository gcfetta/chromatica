const express = require('express');
const { db, audit } = require('./db');
const { ApiError, cfg } = require('./util');
const { normalizarFecha } = require('./fechas');

const router = express.Router();
const METODOS = ['efectivo', 'transferencia', 'tarjeta'];
const CAT_LABEL = { corte: 'Corte', color: 'Color', nutri: 'Nutri', otro: 'Otro' };

const entero = (v, msg) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, msg);
  return n;
};

function empleadoDeLinea(linea, categoria) {
  let id = linea.empleado_id;
  // cortes: por defecto, el único empleado activo; el resto queda sin asignar
  if (id === undefined && categoria === 'corte') {
    const activos = db.prepare('SELECT id FROM empleado WHERE activo = 1').all();
    id = activos.length === 1 ? activos[0].id : null;
  }
  if (id == null) return null;
  if (!db.prepare('SELECT 1 FROM empleado WHERE id = ? AND activo = 1').get(Number(id)))
    throw new ApiError(400, 'Empleado inexistente o inactivo');
  return Number(id);
}

const MODO_DEFECTO = (cat) => (cat === 'color'
  ? { modo: 'hora', valor: 0 }
  : { modo: 'porcentaje', valor: Number(cfg('comision_default_pct') || 0) });

function horasValidas(h) {
  if (h == null || h === '') return null;
  const n = Number(h);
  if (!(n > 0 && n <= 24)) throw new ApiError(400, 'Horas inválidas (entre 0 y 24)');
  return Math.round(n * 100) / 100;
}

// Cuánto se le paga al empleado por esta línea:
//  - porcentaje: % del precio final cobrado
//  - hora: horas reales x valor por hora (si faltan las horas, queda pendiente en 0)
function pagoDeLinea(empleadoId, categoria, cobrado, horas) {
  if (!empleadoId) return { pago_modo: null, pago_valor: 0, pago_monto: 0, horas: null };
  const r = db.prepare('SELECT modo, valor FROM pago_empleado WHERE empleado_id = ? AND categoria = ?').get(empleadoId, categoria);
  const { modo, valor } = r || MODO_DEFECTO(categoria);
  if (modo === 'porcentaje') return { pago_modo: modo, pago_valor: valor, pago_monto: Math.round(cobrado * valor / 100), horas: null };
  return { pago_modo: modo, pago_valor: valor, pago_monto: horas == null ? 0 : Math.round(horas * valor), horas };
}

// Calcula una línea: precio de lista, precio final (con descuento de efectivo) y pago al empleado
function calcularLinea(l, metodo, descPct) {
  let categoria, recorrido, lista, variante_id = null, automatico;

  if (l.variante_id != null) {
    const v = db.prepare(`SELECT v.id, v.etiqueta, v.precio_tarjeta, v.precio_efectivo, s.nombre, s.categoria
      FROM servicio_variante v JOIN servicio s ON s.id = v.servicio_id
      WHERE v.id = ? AND v.activo = 1 AND s.activo = 1`).get(Number(l.variante_id));
    if (!v) throw new ApiError(400, `Servicio inexistente (variante ${l.variante_id})`);
    categoria = v.categoria; variante_id = v.id; lista = v.precio_tarjeta;
    recorrido = [CAT_LABEL[categoria], v.nombre, v.etiqueta === 'Único' ? null : v.etiqueta].filter(Boolean).join(' › ');
    // cortes: precio fijo; color y nutri: efectivo/transferencia llevan descuento
    automatico = metodo === 'tarjeta' || categoria === 'corte' ? lista : v.precio_efectivo;
  } else if (l.categoria === 'otro') {
    const descripcion = String(l.descripcion || '').trim();
    if (!descripcion) throw new ApiError(400, 'Falta la descripción del servicio "Otro"');
    lista = entero(l.monto, 'Monto inválido en "Otro"');
    if (lista <= 0) throw new ApiError(400, 'El monto de "Otro" debe ser mayor a 0');
    categoria = 'otro'; recorrido = `Otro › ${descripcion}`;
    automatico = metodo === 'tarjeta' || l.aplicar_descuento === false
      ? lista : Math.round(lista * (100 - descPct) / 100);
  } else {
    throw new ApiError(400, 'Cada servicio necesita variante_id, o categoria "otro" con descripcion y monto');
  }

  let cobrado = automatico, editado = 0;
  if (l.precio_cobrado != null) {
    const p = entero(l.precio_cobrado, 'Precio editado inválido');
    if (p !== automatico) { cobrado = p; editado = 1; }
  }

  const empleado_id = empleadoDeLinea(l, categoria);
  return {
    variante_id, categoria, recorrido, empleado_id,
    precio_lista: lista, precio_cobrado: cobrado, editado,
    ...pagoDeLinea(empleado_id, categoria, cobrado, horasValidas(l.horas)),
  };
}

function detalle(id) {
  const t = db.prepare('SELECT * FROM turno WHERE id = ?').get(id);
  if (!t) return null;
  const servicios = db.prepare(`SELECT ts.*, e.nombre AS empleado FROM turno_servicio ts
    LEFT JOIN empleado e ON e.id = ts.empleado_id WHERE ts.turno_id = ? ORDER BY ts.id`).all(id);
  const cliente = t.cliente_id
    ? db.prepare('SELECT id, nombre, contacto, ficha, observacion, notas_importantes FROM cliente WHERE id = ?').get(t.cliente_id)
    : null;
  return {
    ...t, cliente,
    servicios: servicios.map((s) => ({
      ...s,
      descuento: s.precio_lista - s.precio_cobrado,
      horas_pendientes: s.pago_modo === 'hora' && s.horas == null ? 1 : 0,
    })),
    saldo: t.total - t.sena,
    pago_empleados: servicios.reduce((a, s) => a + s.pago_monto, 0),
    horas_pendientes: servicios.filter((s) => s.pago_modo === 'hora' && s.horas == null).length,
  };
}

// Crea el cobro (= "turno")
router.post('/', (req, res) => {
  const b = req.body || {};
  if (!METODOS.includes(b.metodo_cobro)) throw new ApiError(400, 'Método de pago inválido');
  if (!Array.isArray(b.servicios) || !b.servicios.length) throw new ApiError(400, 'Agregá al menos un servicio');
  if (b.cliente_id != null && !db.prepare('SELECT 1 FROM cliente WHERE id = ?').get(Number(b.cliente_id)))
    throw new ApiError(400, 'Clienta inexistente');

  const descPct = Number(cfg('descuento_efectivo_pct') || 0);
  const lineas = b.servicios.map((l) => calcularLinea(l, b.metodo_cobro, descPct));
  const total = lineas.reduce((a, l) => a + l.precio_cobrado, 0);

  let sena = 0;
  if (b.sena === true) sena = Number(cfg('sena_default') || 0);
  else if (b.sena != null && b.sena !== false) sena = entero(b.sena, 'Seña inválida');
  if (sena > total) throw new ApiError(400, 'La seña no puede ser mayor al total');

  const fecha = normalizarFecha(b.fecha);
  const id = db.transaction(() => {
    const id = db.prepare(`INSERT INTO turno(cliente_id, fecha, metodo_cobro, total, sena, ficha, notas)
      VALUES (?, COALESCE(?, datetime('now','localtime')), ?, ?, ?, ?, ?)`)
      .run(b.cliente_id != null ? Number(b.cliente_id) : null, fecha, b.metodo_cobro, total, sena,
        b.ficha ?? null, b.notas ?? null).lastInsertRowid;
    const ins = db.prepare(`INSERT INTO turno_servicio(turno_id, variante_id, categoria, recorrido, empleado_id,
      precio_lista, precio_cobrado, editado, pago_modo, pago_valor, pago_monto, horas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const l of lineas)
      ins.run(id, l.variante_id, l.categoria, l.recorrido, l.empleado_id, l.precio_lista, l.precio_cobrado,
        l.editado, l.pago_modo, l.pago_valor, l.pago_monto, l.horas);
    audit('turno', id, 'crear', { total, sena, metodo: b.metodo_cobro, servicios: lineas.length });
    return id;
  })();
  res.status(201).json(detalle(id));
});

router.get('/:id', (req, res) => {
  const d = detalle(Number(req.params.id));
  if (!d) throw new ApiError(404, 'Cobro inexistente');
  res.json(d);
});

// Agregar / quitar clienta y ficha, notas o corregir la fecha (queda en auditoría)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT * FROM turno WHERE id = ?').get(id);
  if (!t) throw new ApiError(404, 'Cobro inexistente');
  if (t.anulado) throw new ApiError(409, 'El cobro está anulado');
  if (t.cierre_id) throw new ApiError(409, 'El cobro ya está en un cierre de caja');
  const b = req.body || {};
  const cambios = {};
  if ('cliente_id' in b) {
    if (b.cliente_id != null && !db.prepare('SELECT 1 FROM cliente WHERE id = ?').get(Number(b.cliente_id)))
      throw new ApiError(400, 'Clienta inexistente');
    cambios.cliente_id = b.cliente_id != null ? Number(b.cliente_id) : null;
  }
  if ('ficha' in b) cambios.ficha = b.ficha || null;
  if ('notas' in b) cambios.notas = b.notas || null;
  if ('fecha' in b) cambios.fecha = normalizarFecha(b.fecha) || t.fecha;
  if (!Object.keys(cambios).length) throw new ApiError(400, 'Nada para cambiar');

  db.transaction(() => {
    for (const [k, v] of Object.entries(cambios)) db.prepare(`UPDATE turno SET ${k} = ? WHERE id = ?`).run(v, id);
    const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, t[k]]));
    audit('turno', id, 'editar', { antes, despues: cambios });
  })();
  res.json(detalle(id));
});

// Los cobros no se borran: se anulan
router.post('/:id/anular', (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT anulado, cierre_id FROM turno WHERE id = ?').get(id);
  if (!t) throw new ApiError(404, 'Cobro inexistente');
  if (t.anulado) throw new ApiError(409, 'Ya estaba anulado');
  if (t.cierre_id) throw new ApiError(409, 'El cobro ya está en un cierre de caja (anulá el cierre para corregirlo)');
  db.transaction(() => {
    db.prepare('UPDATE turno SET anulado = 1 WHERE id = ?').run(id);
    audit('turno', id, 'anular', { motivo: req.body?.motivo ?? null });
  })();
  res.json(detalle(id));
});

// Completar o corregir las horas (color) o el empleado de un servicio ya cobrado
router.put('/:id/servicios/:sid', (req, res) => {
  const id = Number(req.params.id), sid = Number(req.params.sid);
  const t = db.prepare('SELECT anulado, cierre_id FROM turno WHERE id = ?').get(id);
  if (!t) throw new ApiError(404, 'Cobro inexistente');
  if (t.anulado) throw new ApiError(409, 'El cobro está anulado');
  if (t.cierre_id) throw new ApiError(409, 'El cobro ya está en un cierre de caja');
  const l = db.prepare('SELECT * FROM turno_servicio WHERE id = ? AND turno_id = ?').get(sid, id);
  if (!l) throw new ApiError(404, 'Servicio inexistente en ese cobro');
  const b = req.body || {};
  const empleado_id = 'empleado_id' in b ? empleadoDeLinea({ empleado_id: b.empleado_id ?? null }, l.categoria) : l.empleado_id;
  const horas = 'horas' in b ? horasValidas(b.horas) : l.horas;
  const p = pagoDeLinea(empleado_id, l.categoria, l.precio_cobrado, horas);
  db.transaction(() => {
    db.prepare(`UPDATE turno_servicio SET empleado_id = ?, pago_modo = ?, pago_valor = ?, pago_monto = ?, horas = ? WHERE id = ?`)
      .run(empleado_id, p.pago_modo, p.pago_valor, p.pago_monto, p.horas, sid);
    audit('turno', id, 'editar_servicio', {
      servicio: sid, antes: { empleado_id: l.empleado_id, horas: l.horas, pago: l.pago_monto },
      despues: { empleado_id, horas: p.horas, pago: p.pago_monto },
    });
  })();
  res.json(detalle(id));
});

module.exports = { router };